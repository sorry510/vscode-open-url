import * as vscode from 'vscode';

type UrlEntry = { label?: string; url: string };

function normalizeConfigEntries(raw: any[] | undefined): UrlEntry[] {
	if (!raw) {
		return [];
	}
	return raw.map((it) => {
		if (typeof it === 'string') {
			return { url: it };
		}
		if (typeof it === 'object' && it.url) {
			return { label: it.label, url: it.url };
		}
		return { url: String(it) };
	});
}

function expandVariables(template?: string): string {
	if (!template) {return '';}
	const editor = vscode.window.activeTextEditor;
	const workspaceFolders = vscode.workspace.workspaceFolders || [];

	return template.replace(/\$\{([^}]+)\}/g, (_, expr) => {
		// env:VAR
		if (expr.startsWith('env:')) {
			const name = expr.slice(4);
			return process.env[name] ?? '';
		}

		// workspaceFolder[:name]
		if (expr.startsWith('workspaceFolder')) {
			const parts = expr.split(':');
			if (parts.length === 1) {
				return workspaceFolders[0]?.uri.fsPath ?? '';
			}
			const name = parts[1];
			const found = workspaceFolders.find((f) => f.name === name);
			return found?.uri.fsPath ?? '';
		}

		if (expr === 'cwd') {
			return process.cwd();
		}

		if (expr === 'file' || expr === 'filePath') {
			return editor?.document.uri.fsPath ?? '';
		}

		if (expr === 'fileBasename') {
			return editor ? vscode.workspace.asRelativePath(editor.document.uri, false).split('/').pop() || '' : '';
		}

		if (expr === 'fileBasenameNoExtension') {
			const base = editor ? vscode.workspace.asRelativePath(editor.document.uri, false).split('/').pop() || '' : '';
			const idx = base.lastIndexOf('.');
			return idx > 0 ? base.slice(0, idx) : base;
		}

		if (expr === 'fileDirname') {
			if (!editor) {return '';}
			const full = editor.document.uri.fsPath;
			const idx = full.lastIndexOf('/');
			return idx >= 0 ? full.slice(0, idx) : '';
		}

		if (expr === 'relativeFile') {
			if (!editor) {return '';}
			return vscode.workspace.asRelativePath(editor.document.uri, false);
		}

		if (expr === 'selectedText') {
			if (!editor) {return '';}
			return editor.document.getText(editor.selection) ?? '';
		}

		if (expr === 'lineNumber') {
			if (!editor) {return '';}
			return String(editor.selection.active.line + 1);
		}

		// fallback: try env
		return process.env[expr] ?? '';
	});
}

function getConfigUrls(): UrlEntry[] {
	const cfg = vscode.workspace.getConfiguration();
	const raw = cfg.get('openUrl.urls') as any[] | undefined;
	return normalizeConfigEntries(raw);
}

export function activate(context: vscode.ExtensionContext) {
	const commandId = 'extension.openUrl';

	const openUrlAction = async () => {
		const entries = getConfigUrls();
		if (!entries || entries.length === 0) {
			void vscode.window.showInformationMessage('No URLs configured in `openUrl.urls`.');
			return;
		}
        let pick: UrlEntry| undefined = entries[0];
        if (entries.length === 1) {
            pick = entries[0];
        } else {
            const quick = await vscode.window.showQuickPick(
                entries.map((e) => ({ label: e.label ?? e.url, description: e.label ? e.url : undefined, entry: e })),
                { placeHolder: 'Choose a URL to open' }
            );
            pick = quick?.entry;
        }
        
        if (!pick) {
            return;
        }

		try {
			const expanded = expandVariables(pick.url);
			if (!expanded || expanded.trim().length === 0) {
				void vscode.window.showErrorMessage('URL is empty after variable expansion.');
				return;
			}
			// encode safely
			const safe = encodeURI(expanded);
			await vscode.env.openExternal(vscode.Uri.parse(safe));
		} catch (err) {
			void vscode.window.showErrorMessage(`Failed to open URL: ${String(err)}`);
		}
	};

	const disposable = vscode.commands.registerCommand(commandId, openUrlAction);
	context.subscriptions.push(disposable);
}

export function deactivate() {}
