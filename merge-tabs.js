const fs = require('fs');
let code = fs.readFileSync('src/renderer/components/SettingsPanel.tsx', 'utf8');

const ideRegex = /\{\/\*\s*IDE 设置 Tab\s*\*\/\}\s*<Tabs\.Content value="ide" className="flex-1 overflow-y-auto p-6 data-\[state=inactive\]:hidden">\s*([\s\S]*?)<\/Tabs\.Content>/;
const quicknavRegex = /\{\/\*\s*快捷导航 Tab\s*\*\/\}\s*<Tabs\.Content value="quicknav" className="flex-1 overflow-y-auto p-6 data-\[state=inactive\]:hidden">\s*([\s\S]*?)<\/Tabs\.Content>/;

const ideMatch = code.match(ideRegex);
const quicknavMatch = code.match(quicknavRegex);

if (ideMatch && quicknavMatch) {
  const ideContent = ideMatch[1];
  const quicknavContent = quicknavMatch[1];

  const combinedContent = `{/* 快捷导航 Tab (整合了 IDE 和 快捷导航) */}
                <Tabs.Content value="quicknav" className="flex-1 overflow-hidden flex flex-col p-6 data-[state=inactive]:hidden">
                  <Tabs.Root value={quickNavTab} onValueChange={(v) => setQuickNavTab(v as 'ide' | 'custom')} className="flex-1 flex flex-col h-full overflow-hidden">
                    <Tabs.List className="flex gap-4 border-b border-zinc-800/50 mb-6 flex-shrink-0">
                      <Tabs.Trigger
                        value="ide"
                        className="pb-2 text-sm font-medium text-zinc-400 hover:text-zinc-100 data-[state=active]:text-zinc-100 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 transition-colors bg-transparent border-b-2 border-transparent -mb-[1px]"
                      >
                        {t('settings.quickNav.ideTab')}
                      </Tabs.Trigger>
                      <Tabs.Trigger
                        value="custom"
                        className="pb-2 text-sm font-medium text-zinc-400 hover:text-zinc-100 data-[state=active]:text-zinc-100 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 transition-colors bg-transparent border-b-2 border-transparent -mb-[1px]"
                      >
                        {t('settings.quickNav.customTab')}
                      </Tabs.Trigger>
                    </Tabs.List>

                    <Tabs.Content value="ide" className="flex-1 overflow-y-auto pr-2 data-[state=inactive]:hidden outline-none">
                      ${ideContent}
                    </Tabs.Content>

                    <Tabs.Content value="custom" className="flex-1 overflow-y-auto pr-2 data-[state=inactive]:hidden outline-none">
                      ${quicknavContent}
                    </Tabs.Content>
                  </Tabs.Root>
                </Tabs.Content>`;

  code = code.replace(ideRegex, ''); // Remove the original IDE tab
  code = code.replace(quicknavRegex, combinedContent); // Replace the quicknav tab with the combined one

  fs.writeFileSync('src/renderer/components/SettingsPanel.tsx', code);
  console.log('Successfully merged tabs');
} else {
  console.log('Could not match Regexes:');
  console.log('IDE match:', !!ideMatch);
  console.log('QuickNav match:', !!quicknavMatch);
}