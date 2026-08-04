"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const crypto = require("crypto");
function activate(context) {
    // Register the Apply Transformation command
    let disposable = vscode.commands.registerCommand('arkhe.applyTransformation', () => {
        vscode.window.showInformationMessage('ARKHE: Transformation Applied (252 -> 890)');
    });
    context.subscriptions.push(disposable);
    // Diagnostics collection for ontology feedback
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('arkhe');
    context.subscriptions.push(diagnosticCollection);
    // Automation: on save calculate seal
    vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.fileName.endsWith('.sdx.json')) {
            try {
                const text = document.getText();
                const data = JSON.parse(text);
                // Feedback: check unknown classes
                const diagnostics = [];
                if (data['@type'] && !data['@type'].startsWith('sdx:')) {
                    const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), `Unknown ontology class: ${data['@type']}. Expected sdx:*`, vscode.DiagnosticSeverity.Warning);
                    diagnostics.push(diagnostic);
                }
                diagnosticCollection.set(document.uri, diagnostics);
                // Automation: generate seal
                const hash = crypto.createHash('sha3-256');
                // Very basic mock of canonical JSON
                hash.update(text);
                const seal = hash.digest('hex');
                vscode.window.showInformationMessage(`ARKHE: Generated Seal ${seal.substring(0, 16)}...`);
            }
            catch (e) {
                // Not valid JSON
            }
        }
    });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map