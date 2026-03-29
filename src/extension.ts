import * as vscode from 'vscode'
import { checkSplitPanels, calculateRange, wholeLine, calculatePosition } from './utils'
import { MODE, ModeState, AllStates } from './states'

export function activate(context: vscode.ExtensionContext) {
	let scrollingTask: NodeJS.Timeout
	let settleTask: NodeJS.Timeout
	let scrollingEditor: vscode.ViewColumn | null
	let correspondingLinesHighlight: vscode.TextEditorDecorationType | undefined
	let previousState: MODE = MODE.OFF
	const scrolledEditorsQueue: Set<vscode.ViewColumn> = new Set()
	const offsetByEditors: Map<vscode.ViewColumn, number> = new Map()
	const reset = () => {
		offsetByEditors.clear()
		scrolledEditorsQueue.clear()
		scrollingEditor = null
		clearTimeout(scrollingTask)
		clearTimeout(settleTask)
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
			const offset = offsetByEditors.get(nextTextEditor.viewColumn!)
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
								calculateRange(selection, offsetByEditors.get(scrolledEditor.viewColumn!)),
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
				previousState = MODE.NORMAL
				modeState.setMode(MODE.OFF)
			}
		}),
		vscode.window.onDidChangeVisibleTextEditors(textEditors => {
			AllStates.areVisible = checkSplitPanels(textEditors)
			reset()
		}),
		vscode.window.onDidChangeTextEditorVisibleRanges(({ textEditor }) => {
			if (!AllStates.areVisible || modeState.isOff() || textEditor.viewColumn === undefined || textEditor.document.uri.scheme === 'output') {
				return
			}
			if (scrollingEditor !== textEditor.viewColumn) {
				if (scrolledEditorsQueue.has(textEditor.viewColumn!)) {
					scrolledEditorsQueue.delete(textEditor.viewColumn!)
					return
				}
				scrollingEditor = textEditor.viewColumn!
			}
			if (scrollingTask) {
				clearTimeout(scrollingTask)
			}
			clearTimeout(settleTask)
			scrollingTask = setTimeout(() => {
				const source = textEditor
				const sourceCurrentLine = source.visibleRanges[0]?.start.line ?? 0
				const targets = vscode.window.visibleTextEditors
					.filter(e => e !== source && e.viewColumn !== undefined && e.document.uri.scheme !== 'output')

				if (targets.length === 0) return

				for (const target of targets) {
					const requestedLine = Math.max(0, sourceCurrentLine)

					scrolledEditorsQueue.add(target.viewColumn!)
					target.revealRange(
						new vscode.Range(requestedLine, 0, requestedLine, 0),
						vscode.TextEditorRevealType.AtTop
					)
				}

				settleTask = setTimeout(() => {
					const settleSource = textEditor
					const settleSourceLine = settleSource.visibleRanges[0]?.start.line ?? 0
					const settleTargets = vscode.window.visibleTextEditors
						.filter(e => e !== settleSource && e.viewColumn !== undefined && e.document.uri.scheme !== 'output')

					scrolledEditorsQueue.clear()
					for (const target of settleTargets) {
						const expectedLine = Math.max(0, settleSourceLine)
						const targetCurrentLine = target.visibleRanges[0]?.start.line ?? 0
						const gap = targetCurrentLine - expectedLine
						const correcting = gap !== 0
						if (correcting) {
							const compensated = Math.max(0, expectedLine - gap)
							scrolledEditorsQueue.add(target.viewColumn!)
							target.revealRange(
								new vscode.Range(compensated, 0, compensated, 0),
								vscode.TextEditorRevealType.AtTop
							)
						}
					}
				}, 100)
			}, 0)
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
						selections.map(selection => calculateRange(selection, offsetByEditors.get(scrolledEditor.viewColumn!))),
					)
				})
		})
	)

	AllStates.init(checkSplitPanels())
}

export function deactivate() {}
