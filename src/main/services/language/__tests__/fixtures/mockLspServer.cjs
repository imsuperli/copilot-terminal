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
            hoverProvider: true,
            referencesProvider: true,
            documentSymbolProvider: true,
          },
        },
      });
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
