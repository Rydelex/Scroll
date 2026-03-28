import * as vscode from 'vscode'
import { checkSplitPanels, calculateRange, wholeLine, calculatePosition } from './utils'
import { MODE, ModeState, AllStates } from './states'

export function activate(context: vscode.ExtensionContext) {
	let scrollingTask: NodeJS.Timeout
	let scrollingEditor: vscode.TextEditor | null
	let correspondingLinesHighlight :vscode.TextEditorDecorationType | undefined
	let previousState: MODE = MODE.OFF
	const scrolledEditorsQueue: Set<vscode.TextEditor> = new Set()
	const offsetByEditors: Map<vscode.TextEditor, number> = new Map()
	const reset = () => {
		offsetByEditors.clear()
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
		vscode.window.onDidChangeTextEditorVisibleRanges(({ textEditor, visibleRanges }) => {
			const _edId = `col${textEditor.viewColumn}`
			const _qIds = [...scrolledEditorsQueue].map(e => `col${e.viewColumn}`).join(',') || 'empty'
			const _scId = scrollingEditor ? `col${scrollingEditor.viewColumn}` : 'none'
			console.log(`[SyncScroll] EVENT ${_edId} | vr=${visibleRanges[0]?.start.line}-${visibleRanges[0]?.end.line} | scrollingEd=${_scId} | queue=[${_qIds}]`)
			if (!AllStates.areVisible || modeState.isOff() || textEditor.viewColumn === undefined || textEditor.document.uri.scheme === 'output') {
				return
			}
			if (scrollingEditor !== textEditor) {
				if (scrolledEditorsQueue.has(textEditor)) {
					scrolledEditorsQueue.delete(textEditor)
					console.log(`[SyncScroll] BLOCKED ${_edId} (was in queue) → early return`)
					return
				}
				console.log(`[SyncScroll] PASSED ${_edId} → new scrollingEditor (was ${_scId})`)
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
				vscode.window.visibleTextEditors
					.filter(editor => editor !== textEditor && editor.document.uri.scheme !== 'output')
					.forEach(scrolledEditor => {
						const _tgtId = `col${scrolledEditor.viewColumn}`
						const _offset = offsetByEditors.get(scrolledEditor)
						const _range = calculateRange(visibleRanges[0], _offset, textEditor, scrolledEditor)
						console.log(`[SyncScroll] REVEAL ${_edId}→${_tgtId} | offset=${_offset ?? 'undef(→0)'} | range=${_range.start.line}-${_range.end.line} | revealType=AtTop`)
						scrolledEditorsQueue.add(scrolledEditor)
						scrolledEditor.revealRange(_range, vscode.TextEditorRevealType.AtTop)
					})
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
		}),

		// ── DIAGNOSTIC TEST COMMANDS (temporary) ─────────────────────────────────
		vscode.commands.registerCommand('syncScroll.testEditorScroll', async () => {
			const editors = vscode.window.visibleTextEditors
				.filter(e => e.viewColumn !== undefined && e.document.uri.scheme !== 'output')
				.sort((a, b) => (a.viewColumn ?? 0) - (b.viewColumn ?? 0))
			if (editors.length < 2) { vscode.window.showWarningMessage('[SyncScroll-TEST] Need at least 2 split editors'); return }
			const [col1, col2] = editors
			const target = col1.visibleRanges[0]?.start.line ?? 0
			const before = col2.visibleRanges[0]?.start.line ?? 0
			const delta = target - before
			console.log(`[SyncScroll-TEST] editorScroll | before=${before} target=${target} delta=${delta}`)
			if (delta === 0) { console.log(`[SyncScroll-TEST] editorScroll | delta=0, nothing to do`); return }
			await vscode.window.showTextDocument(col2.document, { viewColumn: col2.viewColumn, preserveFocus: false })
			await vscode.commands.executeCommand('editorScroll', { to: delta > 0 ? 'down' : 'up', by: 'line', value: Math.abs(delta) })
			setTimeout(() => {
				const after = col2.visibleRanges[0]?.start.line ?? -1
				console.log(`[SyncScroll-TEST] editorScroll | before=${before} target=${target} | after=${after} | offset_from_target=${after - target}`)
			}, 50)
		}),
		vscode.commands.registerCommand('syncScroll.testRevealLine', async () => {
			const editors = vscode.window.visibleTextEditors
				.filter(e => e.viewColumn !== undefined && e.document.uri.scheme !== 'output')
				.sort((a, b) => (a.viewColumn ?? 0) - (b.viewColumn ?? 0))
			if (editors.length < 2) { vscode.window.showWarningMessage('[SyncScroll-TEST] Need at least 2 split editors'); return }
			const [col1, col2] = editors
			const target = col1.visibleRanges[0]?.start.line ?? 0
			const before = col2.visibleRanges[0]?.start.line ?? 0
			console.log(`[SyncScroll-TEST] revealLine | before=${before} target=${target}`)
			await vscode.window.showTextDocument(col2.document, { viewColumn: col2.viewColumn, preserveFocus: false })
			await vscode.commands.executeCommand('revealLine', { lineNumber: target, at: 'top' })
			setTimeout(() => {
				const after = col2.visibleRanges[0]?.start.line ?? -1
				console.log(`[SyncScroll-TEST] revealLine | before=${before} target=${target} | after=${after} | offset_from_target=${after - target}`)
			}, 50)
		}),
		vscode.commands.registerCommand('syncScroll.testRevealCenter', () => {
			const editors = vscode.window.visibleTextEditors
				.filter(e => e.viewColumn !== undefined && e.document.uri.scheme !== 'output')
				.sort((a, b) => (a.viewColumn ?? 0) - (b.viewColumn ?? 0))
			if (editors.length < 2) { vscode.window.showWarningMessage('[SyncScroll-TEST] Need at least 2 split editors'); return }
			const [col1, col2] = editors
			const target = col1.visibleRanges[0]?.start.line ?? 0
			const before = col2.visibleRanges[0]?.start.line ?? 0
			const viewportHeight = (col2.visibleRanges[0]?.end.line ?? 0) - (col2.visibleRanges[0]?.start.line ?? 0)
			const expectedTop = target - Math.floor(viewportHeight / 2)
			console.log(`[SyncScroll-TEST] revealCenter | before=${before} target=${target} viewportH=${viewportHeight} expectedTop=${expectedTop}`)
			col2.revealRange(new vscode.Range(target, 0, target, 0), vscode.TextEditorRevealType.InCenter)
			setTimeout(() => {
				const after = col2.visibleRanges[0]?.start.line ?? -1
				console.log(`[SyncScroll-TEST] revealCenter | before=${before} target=${target} | after=${after} | expected_top=${expectedTop} | offset_from_expected=${after - expectedTop}`)
			}, 50)
		}),
		vscode.commands.registerCommand('syncScroll.testRevealAtTopSingleLine', () => {
			const editors = vscode.window.visibleTextEditors
				.filter(e => e.viewColumn !== undefined && e.document.uri.scheme !== 'output')
				.sort((a, b) => (a.viewColumn ?? 0) - (b.viewColumn ?? 0))
			if (editors.length < 2) { vscode.window.showWarningMessage('[SyncScroll-TEST] Need at least 2 split editors'); return }
			const [col1, col2] = editors
			const target = col1.visibleRanges[0]?.start.line ?? 0
			const before = col2.visibleRanges[0]?.start.line ?? 0
			console.log(`[SyncScroll-TEST] revealAtTopSingleLine | before=${before} target=${target}`)
			col2.revealRange(new vscode.Range(target, 0, target, 0), vscode.TextEditorRevealType.AtTop)
			setTimeout(() => {
				const after = col2.visibleRanges[0]?.start.line ?? -1
				console.log(`[SyncScroll-TEST] revealAtTopSingleLine | before=${before} target=${target} | after=${after} | offset_from_target=${after - target}`)
			}, 50)
		}),
		vscode.commands.registerCommand('syncScroll.testEditorScrollNoFocus', async () => {
			const editors = vscode.window.visibleTextEditors
				.filter(e => e.viewColumn !== undefined && e.document.uri.scheme !== 'output')
				.sort((a, b) => (a.viewColumn ?? 0) - (b.viewColumn ?? 0))
			if (editors.length < 2) { vscode.window.showWarningMessage('[SyncScroll-TEST] Need at least 2 split editors'); return }
			const [col1, col2] = editors

			// Sub-test 1: NO FOCUS — col1 stays active, editorScroll fired without switching focus
			const before1 = col2.visibleRanges[0]?.start.line ?? 0
			const col1Before1 = col1.visibleRanges[0]?.start.line ?? 0
			console.log(`[SyncScroll-TEST] editorScroll NO FOCUS | col1=${col1Before1} col2.before=${before1} | firing editorScroll down 5 (col1 stays active)`)
			await vscode.commands.executeCommand('editorScroll', { to: 'down', by: 'line', value: 5 })
			setTimeout(() => {
				const col2After1 = col2.visibleRanges[0]?.start.line ?? -1
				const col1After1 = col1.visibleRanges[0]?.start.line ?? -1
				console.log(`[SyncScroll-TEST] editorScroll NO FOCUS | col1.moved=${col1After1 - col1Before1} col2.moved=${col2After1 - before1} | expected=5 on active editor`)
			}, 50)

			// Sub-test 2: WITH FOCUS — focus col2, scroll, refocus col1
			setTimeout(async () => {
				const before2 = col2.visibleRanges[0]?.start.line ?? 0
				const col1Before2 = col1.visibleRanges[0]?.start.line ?? 0
				console.log(`[SyncScroll-TEST] editorScroll WITH FOCUS | col1=${col1Before2} col2.before=${before2} | focusing col2...`)
				await vscode.window.showTextDocument(col2.document, { viewColumn: col2.viewColumn, preserveFocus: false })
				await vscode.commands.executeCommand('editorScroll', { to: 'down', by: 'line', value: 5 })
				await vscode.window.showTextDocument(col1.document, { viewColumn: col1.viewColumn, preserveFocus: false })
				setTimeout(() => {
					const col2After2 = col2.visibleRanges[0]?.start.line ?? -1
					const col1After2 = col1.visibleRanges[0]?.start.line ?? -1
					console.log(`[SyncScroll-TEST] editorScroll WITH FOCUS | col1.moved=${col1After2 - col1Before2} col2.moved=${col2After2 - before2} | expected=5 on col2`)
				}, 50)
			}, 200)
		}),
		// ── END DIAGNOSTIC TEST COMMANDS ─────────────────────────────────────────
	)

	AllStates.init(checkSplitPanels())
}

export function deactivate() {}
