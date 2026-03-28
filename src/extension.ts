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
	const calibrationOffset: Map<vscode.TextEditor, number> = new Map()
	const isCalibrating: Set<vscode.TextEditor> = new Set()
	const pendingCalibration: Map<vscode.TextEditor, number> = new Map()
	const reset = () => {
		offsetByEditors.clear()
		calibrationOffset.clear()
		isCalibrating.clear()
		pendingCalibration.clear()
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
		vscode.window.onDidChangeTextEditorVisibleRanges(({ textEditor }) => {
			if (!AllStates.areVisible || modeState.isOff() || textEditor.viewColumn === undefined || textEditor.document.uri.scheme === 'output') {
				return
			}
			if (isCalibrating.has(textEditor)) {
				const requestedLine = pendingCalibration.get(textEditor)!
				const actualLine = textEditor.visibleRanges[0]?.start.line ?? 0
				const offset = requestedLine - actualLine
				calibrationOffset.set(textEditor, offset)
				isCalibrating.delete(textEditor)
				pendingCalibration.delete(textEditor)
				if (offset !== 0) {
					const correctedLine = Math.max(0, requestedLine + offset)
					scrolledEditorsQueue.add(textEditor)
					textEditor.revealRange(
						new vscode.Range(correctedLine, 0, correctedLine, 0),
						vscode.TextEditorRevealType.AtTop
					)
				}
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
			scrollingTask = setTimeout(() => {
				const source = textEditor
				const sourceCurrentLine = source.visibleRanges[0]?.start.line ?? 0
				const targets = vscode.window.visibleTextEditors
					.filter(e => e !== source && e.viewColumn !== undefined && e.document.uri.scheme !== 'output')

				if (targets.length === 0) return

				for (const target of targets) {
					const userOffset = modeState.isOffsetMode() ? (offsetByEditors.get(target) ?? 0) : 0
					const requestedLine = Math.max(0, sourceCurrentLine + userOffset)

					if (!calibrationOffset.has(target)) {
						if (isCalibrating.has(target)) {
							// Rapid scroll during pending calibration: skip to avoid overwriting pendingCalibration
							continue
						}
						isCalibrating.add(target)
						pendingCalibration.set(target, requestedLine)
						target.revealRange(
							new vscode.Range(requestedLine, 0, requestedLine, 0),
							vscode.TextEditorRevealType.AtTop
						)
					} else {
						const compensated = Math.max(0, requestedLine + (calibrationOffset.get(target) ?? 0))
						scrolledEditorsQueue.add(target)
						target.revealRange(
							new vscode.Range(compensated, 0, compensated, 0),
							vscode.TextEditorRevealType.AtTop
						)
					}
				}
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
						selections.map(selection => calculateRange(selection, offsetByEditors.get(scrolledEditor))),
					)
				})
		})
	)

	AllStates.init(checkSplitPanels())
}

export function deactivate() {}
