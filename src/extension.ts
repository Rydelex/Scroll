import * as vscode from 'vscode'
import { checkSplitPanels, calculateRange, wholeLine, calculatePosition } from './utils'
import { MODE, ModeState, AllStates } from './states'

export function activate(context: vscode.ExtensionContext) {
	let scrollingTask: NodeJS.Timeout
	let scrollingEditor: vscode.TextEditor | null
	let correspondingLinesHighlight: vscode.TextEditorDecorationType | undefined
	let previousState: MODE = MODE.OFF
	const scrolledEditorsQueue: Set<vscode.TextEditor> = new Set()
	const offsetByEditors: Map<vscode.TextEditor, number> = new Map()
	const lastKnownLine: Map<vscode.TextEditor, number> = new Map()
	const reset = () => {
		offsetByEditors.clear()
		lastKnownLine.clear()
		scrolledEditorsQueue.clear()
		scrollingEditor = null
		clearTimeout(scrollingTask)
		correspondingLinesHighlight?.dispose()
	}

	const modeState = new ModeState(context)

	// Register disposables
	context.subscriptions.push(
		modeState.registerCommand(() => {
			reset()
		}),
		vscode.commands.registerTextEditorCommand('syncScroll.jumpToNextPanelCorrespondingPosition', (textEditor) => {
			const selection = textEditor.selection
			const textEditors = vscode.window.visibleTextEditors
			.filter(editor => editor !== textEditor && editor.document.uri.scheme !== 'output')
			const nextTextEditor = textEditors[(textEditors.indexOf(textEditor) + 1) % textEditors.length]
			const offset = offsetByEditors.get(nextTextEditor)
			const correspondingStartPosition = calculatePosition(selection.start, offset, textEditor, nextTextEditor)
			const correspondingPosition = new vscode.Range(correspondingStartPosition, correspondingStartPosition)
			const correspondingRange = calculateRange(selection, offset)
			vscode.window.showTextDocument(nextTextEditor.document, {
				viewColumn: nextTextEditor.viewColumn,
				selection: selection.isEmpty ? correspondingPosition : correspondingRange
			})
		}),
		vscode.commands.registerTextEditorCommand('syncScroll.copyToAllCorrespondingPositions', (textEditor) => {
			vscode.window.visibleTextEditors
				.filter(editor => editor !== textEditor && editor.document.uri.scheme !== 'output')
				.forEach(scrolledEditor => {
					scrolledEditor.edit(editBuilder =>
						textEditor.selections.map(selection =>
							editBuilder.replace(
								calculateRange(selection, offsetByEditors.get(scrolledEditor)),
								textEditor.document.getText(selection.isEmpty ? wholeLine(selection) : selection) + '\n')))
				})
		}),
		vscode.commands.registerCommand('syncScroll.toggle', () => {
			if(modeState.isOff()){
				if(previousState !== MODE.OFF){
					var tempState: MODE = previousState
					previousState = MODE.OFF
					modeState.setMode(tempState)
				} else {
					previousState = MODE.OFF
					modeState.setMode(MODE.NORMAL)
				}
			} else {
				previousState = modeState.isNormalMode() ? MODE.NORMAL : MODE.OFFSET
				modeState.setMode(MODE.OFF)
			}
		}),
		vscode.window.onDidChangeVisibleTextEditors(textEditors => {
			AllStates.areVisible = checkSplitPanels(textEditors)
			reset()
		}),
		vscode.commands.registerCommand('syncScroll.testMicroCorrection', async () => {
				const editors = vscode.window.visibleTextEditors
					.filter(e => e.viewColumn !== undefined && e.document.uri.scheme !== 'output')
				if (editors.length < 2) {
					vscode.window.showInformationMessage('[SyncScroll-TEST] Need at least 2 visible editors')
					return
				}
				const col1 = editors[0]
				const col2 = editors[1]

				const col1Line = col1.visibleRanges[0]?.start.line ?? 0
				const targetRange = new vscode.Range(col1Line, 0, col1Line, 0)
				col2.revealRange(targetRange, vscode.TextEditorRevealType.AtTop)

				await new Promise(resolve => setTimeout(resolve, 50))

				const gap = col2.visibleRanges[0].start.line - col1.visibleRanges[0].start.line
				console.log(`[SyncScroll-TEST] microCorrection | after revealRange | col1=${col1.visibleRanges[0].start.line} col2=${col2.visibleRanges[0].start.line} gap=${gap}`)

				if (gap !== 0) {
					await vscode.window.showTextDocument(col2.document, { viewColumn: col2.viewColumn, preserveFocus: false })
					await vscode.commands.executeCommand('editorScroll', {
						to: gap > 0 ? 'up' : 'down',
						by: 'line',
						value: Math.abs(gap)
					})
					await vscode.window.showTextDocument(col1.document, { viewColumn: col1.viewColumn, preserveFocus: false })
				}

				const finalCol2Line = col2.visibleRanges[0].start.line
				console.log(`[SyncScroll-TEST] microCorrection | corrected=${finalCol2Line} | expected=${col1.visibleRanges[0].start.line}`)
				vscode.window.showInformationMessage(`[SyncScroll-TEST] gap=${gap} | corrected=${finalCol2Line}`)
			}),
			vscode.window.onDidChangeTextEditorVisibleRanges(({ textEditor }) => {
			if (!AllStates.areVisible || modeState.isOff() || textEditor.viewColumn === undefined || textEditor.document.uri.scheme === 'output') {
				return
			}
			if (scrollingEditor !== textEditor) {
				if (scrolledEditorsQueue.has(textEditor)) {
					scrolledEditorsQueue.delete(textEditor)
					return
				}
				scrollingEditor = textEditor
				if (modeState.isOffsetMode()) {
					vscode.window.visibleTextEditors
						.filter(editor => editor !== textEditor && editor.document.uri.scheme !== 'output')
						.forEach(scrolledEditor => {
							offsetByEditors.set(scrolledEditor, scrolledEditor.visibleRanges[0].start.line - textEditor.visibleRanges[0].start.line)
						})
				} else if (modeState.isNormalMode()) {
					offsetByEditors.clear()
				}
			}
			if (scrollingTask) {
				clearTimeout(scrollingTask)
			}
			scrollingTask = setTimeout(async () => {
				const source = textEditor
				const sourceCurrentLine = source.visibleRanges[0]?.start.line ?? 0
				const targets = vscode.window.visibleTextEditors
					.filter(e => e !== source && e.viewColumn !== undefined && e.document.uri.scheme !== 'output')

				if (targets.length === 0) return

				if (modeState.isOffsetMode() && !lastKnownLine.has(source)) {
					lastKnownLine.set(source, sourceCurrentLine)
					return
				}

				const sourceDelta = modeState.isOffsetMode()
					? sourceCurrentLine - (lastKnownLine.get(source) ?? sourceCurrentLine)
					: 0

				if (modeState.isOffsetMode() && sourceDelta === 0) {
					lastKnownLine.set(source, sourceCurrentLine)
					return
				}

				const targetSnapshots = targets.map(t => ({
					editor: t,
					currentLine: t.visibleRanges[0]?.start.line ?? 0
				}))

				let didScroll = false
				for (const { editor: target, currentLine: targetCurrentLine } of targetSnapshots) {
					const delta = modeState.isNormalMode()
						? sourceCurrentLine - targetCurrentLine
						: sourceDelta

					if (delta === 0) continue

					scrolledEditorsQueue.add(target)
					await vscode.window.showTextDocument(target.document, { viewColumn: target.viewColumn, preserveFocus: false })
					vscode.commands.executeCommand('editorScroll', {
						to: delta > 0 ? 'down' : 'up',
						by: 'line',
						value: Math.abs(delta)
					})
					if (modeState.isOffsetMode()) {
						lastKnownLine.set(target, targetCurrentLine + delta)
					}
					didScroll = true
				}

				if (modeState.isOffsetMode()) {
					lastKnownLine.set(source, sourceCurrentLine)
				}

				if (didScroll) {
					await vscode.window.showTextDocument(source.document, { viewColumn: source.viewColumn, preserveFocus: false })
				}
			}, 16)
		}),
		vscode.window.onDidChangeTextEditorSelection(({ selections, textEditor }) => {
			if (!AllStates.areVisible || modeState.isOff() || textEditor.viewColumn === undefined || textEditor.document.uri.scheme === 'output') {
				return
			}
			correspondingLinesHighlight?.dispose()
			correspondingLinesHighlight = vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor('editor.inactiveSelectionBackground') })
			vscode.window.visibleTextEditors
				.filter(editor => editor !== textEditor && editor.document.uri.scheme !== 'output')
				.forEach((scrolledEditor) => {
					scrolledEditor.setDecorations(
						correspondingLinesHighlight!,
						selections.map(selection => calculateRange(selection, offsetByEditors.get(scrolledEditor))),
					)
				})
		})
	)

	AllStates.init(checkSplitPanels())
}

export function deactivate() {}
