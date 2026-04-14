const documents = new Map();
let stdoutBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
  flushMessages();
});

process.stdin.resume();

function flushMessages() {
  while (true) {
    const separatorIndex = stdoutBuffer.indexOf('\r\n\r\n');
    if (separatorIndex === -1) {
      return;
    }

    const headerText = stdoutBuffer.slice(0, separatorIndex).toString('utf8');
    const contentLengthLine = headerText
      .split('\r\n')
      .find((line) => line.toLowerCase().startsWith('content-length:'));
    if (!contentLengthLine) {
      stdoutBuffer = stdoutBuffer.slice(separatorIndex + 4);
      continue;
    }

    const contentLength = Number(contentLengthLine.split(':')[1].trim());
    const messageStartIndex = separatorIndex + 4;
    const messageEndIndex = messageStartIndex + contentLength;
    if (!Number.isFinite(contentLength) || stdoutBuffer.length < messageEndIndex) {
      return;
    }

    const payload = stdoutBuffer.slice(messageStartIndex, messageEndIndex);
    stdoutBuffer = stdoutBuffer.slice(messageEndIndex);
    handleMessage(JSON.parse(payload.toString('utf8')));
  }
}

function handleMessage(message) {
  switch (message.method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          capabilities: {
            textDocumentSync: 1,
            definitionProvider: true,
            completionProvider: {
              triggerCharacters: ['.'],
            },
            hoverProvider: true,
            referencesProvider: true,
            documentHighlightProvider: true,
            signatureHelpProvider: {
              triggerCharacters: ['(', ','],
            },
            implementationProvider: true,
            codeActionProvider: {
              resolveProvider: true,
            },
            renameProvider: true,
            documentFormattingProvider: true,
            documentSymbolProvider: true,
            workspaceSymbolProvider: true,
          },
        },
      });
      return;
    case 'initialized':
      send({
        jsonrpc: '2.0',
        id: 9001,
        method: 'window/workDoneProgress/create',
        params: {
          token: 'mock-import',
        },
      });
      setTimeout(() => {
        send({
          jsonrpc: '2.0',
          method: '$/progress',
          params: {
            token: 'mock-import',
            value: {
              kind: 'begin',
              title: 'Importing Maven project',
              message: 'Resolving classpath',
            },
          },
        });
      }, 5);
      setTimeout(() => {
        send({
          jsonrpc: '2.0',
          method: '$/progress',
          params: {
            token: 'mock-import',
            value: {
              kind: 'end',
              message: 'Workspace ready',
            },
          },
        });
      }, 25);
      return;
    case 'textDocument/didOpen': {
      const { uri, text } = message.params.textDocument;
      documents.set(uri, text);
      publishDiagnostics(uri, text);
      return;
    }
    case 'textDocument/didChange': {
      const uri = message.params.textDocument.uri;
      const text = message.params.contentChanges?.at(-1)?.text ?? documents.get(uri) ?? '';
      documents.set(uri, text);
      publishDiagnostics(uri, text);
      return;
    }
    case 'textDocument/didClose': {
      const uri = message.params.textDocument.uri;
      documents.delete(uri);
      publishDiagnostics(uri, '');
      return;
    }
    case 'textDocument/definition': {
      const uri = message.params.textDocument.uri;
      const character = message.params.position?.character ?? 0;
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: character === 1
          ? [{
              uri: 'jdt://contents/java.base/java/lang/String.class?=mock',
              range: createRange(10, 4, 10, 10),
            }]
          : [{
              uri,
              range: createRange(0, 0, 0, 4),
            }],
      });
      return;
    }
    case 'java/classFileContents':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: [
          'package java.lang;',
          '',
          'public final class String {',
          '  public int length() {',
          '    return 0;',
          '  }',
          '}',
          '',
        ].join('\n'),
      });
      return;
    case 'textDocument/hover':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          contents: [
            {
              kind: 'markdown',
              value: '**Mock Hover**',
            },
          ],
          range: createRange(0, 0, 0, 4),
        },
      });
      return;
    case 'textDocument/completion':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          items: [{
            label: 'mockCompletion',
            detail: 'Mock detail',
            documentation: {
              kind: 'markdown',
              value: '**Mock Completion**',
            },
            kind: 3,
            insertText: 'mockCompletion()',
            textEdit: {
              range: createRange(0, 0, 0, 4),
              newText: 'mockCompletion()',
            },
          }],
        },
      });
      return;
    case 'textDocument/signatureHelp':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          signatures: [{
            label: 'mockCompletion(value: string)',
            documentation: {
              kind: 'markdown',
              value: '**Mock Signature**',
            },
            parameters: [{
              label: [15, 28],
              documentation: 'value parameter',
            }],
          }],
          activeSignature: 0,
          activeParameter: 0,
        },
      });
      return;
    case 'textDocument/references': {
      const uri = message.params.textDocument.uri;
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: [{
          uri,
          range: createRange(0, 0, 0, 4),
        }],
      });
      return;
    }
    case 'textDocument/documentHighlight':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: [{
          range: createRange(0, 13, 0, 18),
          kind: 2,
        }],
      });
      return;
    case 'textDocument/implementation': {
      const uri = message.params.textDocument.uri;
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: [{
          uri,
          range: createRange(4, 2, 4, 12),
        }],
      });
      return;
    }
    case 'textDocument/codeAction':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: [
          {
            title: 'Add missing import',
            kind: 'quickfix',
            isPreferred: true,
            data: {
              action: 'add-import',
            },
          },
          {
            title: 'Organize imports',
            kind: 'source.organizeImports',
            command: {
              title: 'Organize imports',
              command: 'mock.organizeImports',
              arguments: [message.params.textDocument.uri],
            },
          },
        ],
      });
      return;
    case 'codeAction/resolve': {
      const uri = Array.from(documents.keys())[0];
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          ...message.params,
          ...(message.params?.data?.action === 'add-import'
            ? {
                edit: {
                  changes: uri ? {
                    [uri]: [{
                      range: createRange(0, 0, 0, 0),
                      newText: "import mock.Dependency;\n",
                    }],
                  } : {},
                },
              }
            : {}),
        },
      });
      return;
    }
    case 'workspace/executeCommand': {
      const uri = message.params.arguments?.[0] ?? Array.from(documents.keys())[0];
      send({
        jsonrpc: '2.0',
        id: 9100,
        method: 'workspace/applyEdit',
        params: {
          edit: {
            changes: uri ? {
              [uri]: [{
                range: createRange(0, 0, 0, 0),
                newText: '// organized\n',
              }],
            } : {},
          },
        },
      });
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: null,
      });
      return;
    }
    case 'textDocument/rename': {
      const uri = message.params.textDocument.uri;
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          changes: {
            [uri]: [{
              range: createRange(0, 0, 0, 4),
              newText: message.params.newName,
            }],
          },
        },
      });
      return;
    }
    case 'textDocument/formatting': {
      const uri = message.params.textDocument.uri;
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: [{
          range: createRange(0, 0, 0, 4),
          newText: 'Main',
        }],
      });
      return;
    }
    case 'textDocument/documentSymbol':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: [{
          name: 'Main',
          detail: 'class',
          kind: 5,
          range: createRange(0, 0, 2, 0),
          selectionRange: createRange(0, 0, 0, 4),
        }],
      });
      return;
    case 'workspace/symbol': {
      const firstDocumentUri = Array.from(documents.keys())[0];
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: firstDocumentUri
          ? [{
              name: message.params.query || 'Main',
              kind: 5,
              location: {
                uri: firstDocumentUri,
                range: createRange(0, 0, 0, 4),
              },
              containerName: 'mock',
            }]
          : [],
      });
      return;
    }
    case 'shutdown':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: null,
      });
      return;
    case 'exit':
      process.exit(0);
      return;
    default:
      if (typeof message.id === 'number') {
        send({
          jsonrpc: '2.0',
          id: message.id,
          result: null,
        });
      }
  }
}

function publishDiagnostics(uri, text) {
  send({
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: {
      uri,
      diagnostics: text.includes('problem')
        ? [{
            severity: 2,
            message: 'Mock warning',
            source: 'mock-lsp',
            code: 'MOCK001',
            range: createRange(0, 0, 0, 7),
          }]
        : [],
    },
  });
}

function createRange(startLine, startCharacter, endLine, endCharacter) {
  return {
    start: {
      line: startLine,
      character: startCharacter,
    },
    end: {
      line: endLine,
      character: endCharacter,
    },
  };
}

function send(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  process.stdout.write(payload);
}
