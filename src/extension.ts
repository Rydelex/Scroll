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
	const calibrationOffset: Map<vscode.ViewColumn, number> = new Map()
	const isCalibrating: Set<vscode.ViewColumn> = new Set()
	const pendingCalibration: Map<vscode.ViewColumn, number> = new Map()
	const reset = () => {
		offsetByEditors.clear()
		calibrationOffset.clear()
		isCalibrating.clear()
		pendingCalibration.clear()
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
				if (modeState.isOff() && AllStates.areVisible && textEditor.viewColumn !== undefined && textEditor.document.uri.scheme !== 'output') {
					console.log(`[SyncScroll-GUARD-OFF] BLOCKED col=${textEditor.viewColumn} — mode is OFF`)
				}
				return
			}
			if (isCalibrating.has(textEditor.viewColumn!)) {
				const requestedLine = pendingCalibration.get(textEditor.viewColumn!)!
				const actualLine = textEditor.visibleRanges[0]?.start.line ?? 0
				const offset = requestedLine - actualLine
				calibrationOffset.set(textEditor.viewColumn!, offset)
				isCalibrating.delete(textEditor.viewColumn!)
				pendingCalibration.delete(textEditor.viewColumn!)
				if (offset !== 0) {
					const correctedLine = Math.max(0, requestedLine + offset)
					scrolledEditorsQueue.add(textEditor.viewColumn!)
					textEditor.revealRange(
						new vscode.Range(correctedLine, 0, correctedLine, 0),
						vscode.TextEditorRevealType.AtTop
					)
				}
				return
			}
			if (scrollingEditor !== textEditor.viewColumn) {
				if (scrolledEditorsQueue.has(textEditor.viewColumn!)) {
					console.log(`[SyncScroll-GUARD-QUEUE] BLOCKED col=${textEditor.viewColumn} scrollingEditor=${scrollingEditor} queue=[${[...scrolledEditorsQueue].join(',')}]`)
					scrolledEditorsQueue.delete(textEditor.viewColumn!)
					return
				}
				scrollingEditor = textEditor.viewColumn!
				if (modeState.isOffsetMode()) {
					vscode.window.visibleTextEditors
						.filter(editor => editor !== textEditor && editor.document.uri.scheme !== 'output')
						.forEach(scrolledEditor => {
							offsetByEditors.set(scrolledEditor.viewColumn!, scrolledEditor.visibleRanges[0].start.line - textEditor.visibleRanges[0].start.line)
						})
				} else if (modeState.isNormalMode()) {
					offsetByEditors.clear()
				}
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
					const userOffset = modeState.isOffsetMode() ? (offsetByEditors.get(target.viewColumn!) ?? 0) : 0
					const requestedLine = Math.max(0, sourceCurrentLine + userOffset)

					if (!calibrationOffset.has(target.viewColumn!)) {
						if (isCalibrating.has(target.viewColumn!)) {
							// Rapid scroll during pending calibration: skip to avoid overwriting pendingCalibration
							continue
						}
						isCalibrating.add(target.viewColumn!)
						pendingCalibration.set(target.viewColumn!, requestedLine)
						target.revealRange(
							new vscode.Range(requestedLine, 0, requestedLine, 0),
							vscode.TextEditorRevealType.AtTop
						)
					} else {
						const compensated = Math.max(0, requestedLine + (calibrationOffset.get(target.viewColumn!) ?? 0))
						scrolledEditorsQueue.add(target.viewColumn!)
						target.revealRange(
							new vscode.Range(compensated, 0, compensated, 0),
							vscode.TextEditorRevealType.AtTop
						)
					}
				}

				settleTask = setTimeout(() => {
					const settleSource = textEditor
					const settleSourceLine = settleSource.visibleRanges[0]?.start.line ?? 0
					const settleTargets = vscode.window.visibleTextEditors
						.filter(e => e !== settleSource && e.viewColumn !== undefined && e.document.uri.scheme !== 'output')

					console.log(`[SyncScroll-SETTLE] FIRED | source=col${settleSource.viewColumn} line=${settleSourceLine}`)

					for (const target of settleTargets) {
						if (!calibrationOffset.has(target.viewColumn!)) {
							console.log(`[SyncScroll-SETTLE-SKIP] target=col${target.viewColumn} hasCalib=false — skipped`)
							continue
						}
						const userOffset = modeState.isOffsetMode() ? (offsetByEditors.get(target.viewColumn!) ?? 0) : 0
						const expectedLine = Math.max(0, settleSourceLine + userOffset)
						const targetCurrentLine = target.visibleRanges[0]?.start.line ?? 0
						const gap = targetCurrentLine - expectedLine
						const correcting = gap !== 0
						console.log(`[SyncScroll-SETTLE] target=col${target.viewColumn} | actual=${targetCurrentLine} | expected=${expectedLine} | gap=${gap} | correcting=${correcting}`)
						if (correcting) {
							console.log(`[SyncScroll-SETTLE] calibOffset=${calibrationOffset.get(target.viewColumn!)} for col${target.viewColumn}`)
							const compensated = Math.max(0, expectedLine - gap)
							scrolledEditorsQueue.add(target.viewColumn!)
							target.revealRange(
								new vscode.Range(compensated, 0, compensated, 0),
								vscode.TextEditorRevealType.AtTop
							)
							console.log(`[SyncScroll-SETTLE] CORRECTED target=col${target.viewColumn} → line=${compensated}`)
						}
					}
					scrolledEditorsQueue.clear()
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
