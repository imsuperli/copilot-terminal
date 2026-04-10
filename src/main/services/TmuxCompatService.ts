/**
 * TmuxCompatService 闂傚倸鍊峰ù鍥綖婢跺顩插ù鐘差儏绾惧潡寮堕崼顐簴濞存粏顫夌换娑㈠箣閻愯尙鍔伴梺绋款儐閹搁箖骞夐幘顔肩妞ゆ挾濮磋ぐ搴ｇ磽? *
 * 濠电姷鏁搁崑鐐哄垂閸洖绠伴悹鍥у棘閿濆绠抽柡鍐ｅ亾鐎规洖寮舵穱濠囶敍濠靛棔姹楅梺娲诲幗閻熲晠骞冨Δ鍛櫜闁稿本绋掗悵妤呮⒑閸涘渚涢柛鎾跺枛瀵?tmux 闂傚倸鍊烽懗鍫曗€﹂崼銏″床闁圭儤顨呴崒銊ф喐閺冨牄鈧礁鈻庨幘宕囩杸闂佸搫顦悘婵嬫偟濮椻偓閹鐛崹顔煎闂佺懓鍟块柊锝夋晲閻愬搫围濠㈣泛顑囬崣鍡椻攽閻愭潙鐏︽い顓炴喘閹偞顦版惔锝囷紲闂侀€炲苯澧伴柍褜鍓ㄧ紞鍡涘礈濮樻墎鍋撳顒夌吋闁哄被鍔岄埞鎴﹀幢濮楀棙顥ｅ┑鐘灱濞夋稓绮旇ぐ鎺戣摕闁跨喓濮撮悞鍨亜閹烘垵鈧懓鐣锋径鎰厽闁瑰浼濋鍫晜妞ゆ牗绋撶弧鈧梺闈涢獜缁插墽娑垫ィ鍐╁€垫慨妯煎帶濞呭秵顨ラ悙鎻掓殲缂佺粯绻堝畷鎯邦槾濡ょ姴娲娲濞戣鲸肖闂佸憡鏌ㄩ懟顖炲煝?fake tmux shim 闂傚倸鍊烽悞锕傛儑瑜版帒绀夌€光偓閳ь剟鍩€椤掍礁鍤柛鎾跺枛閻涱喗绻濋崶褏鍔撮梺鍛婂姦娴滆泛霉閸曨垱鈷戦梻鍫熺〒婢ф洟鏌ｅΔ浣虹煉鐎规洜鏁婚幃娆戔偓娑櫭鍧楁⒑閼姐倕鏋戞繝銏★耿閸┾偓妞ゆ巻鍋撻柣鏍с偢瀹曟椽鍩€? */

import { EventEmitter } from 'events';
import {
  TmuxCommandRequest,
  TmuxCommandResponse,
  TmuxPaneId,
  TmuxWindowTarget,
  TmuxSessionName,
  TmuxSession,
  ITmuxCompatService,
  TmuxCommand,
  TmuxPaneMetadata,
} from '../../shared/types/tmux';
import { IProcessManager } from '../types/process';
import { TmuxCommandParser } from './TmuxCommandParser';
import { Window, LayoutNode, Pane, WindowStatus } from '../../shared/types/window';
import type { PtyWriteMetadata } from '../../shared/types/electron-api';
import { isTerminalPane } from '../../shared/utils/terminalCapabilities';
import { randomUUID } from 'crypto';
import { TmuxRpcServer } from './TmuxRpcServer';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * ProcessManager 闂傚倸鍊风粈浣革耿闁秲鈧倹绂掔€ｎ亞鏌у┑鐐村灟閸ㄦ椽宕曢幘鍨涘亾楠炲灝鍔氭い锔诲灣缁骞庨懞銉у帾婵犮垼娉涢悧鍡涘礉濮樿京纾界€广儱妫欏畷宀勬煛鐏炶濡奸柍钘夘槸铻ｉ柣鎾冲瘨閺嗩偊姊虹拠鏌ヮ€楅柣蹇斿哺閺佸啴濮€閻樺灚娈?tmux 闂傚倸鍊烽懗鍫曗€﹂崼銏″床闁圭儤顨呴崒銊ф喐閺冨牄鈧礁鈻庨幘宕囩杸濡炪倖姊荤划顖炲礋閸愵喗鈷戠紒瀣硶閻忛亶鏌涚€ｎ剙浠︾紒鍌涘笒椤粓鍩€椤掑嫬绠栭柣鎴ｆ閸楄櫕鎱ㄥΟ鍝勬毐闁告ǚ鈧枼鏀介柣鎰皺婢ф盯鏌涢妸銉у煟闁轰礁绉归獮鍥敄閼恒儲鏉搁梻浣虹《濡狙囧疾濠婂牆鐓濋幖娣妽閳锋垿鏌涘┑鍡楊仼闁逞屽厸缁瑩鏁愰悙鏉戠窞閻忕偞鍎抽崢褰掓⒑閸撴彃浜濇繛鍙夛耿瀵? */
export interface ITmuxProcessManager extends IProcessManager {
  getPidByPane(windowId: string, paneId?: string): number | null;
  writeToPty(pid: number, data: string): void;
  subscribePtyData?(pid: number, callback: (data: string, seq?: number) => void): () => void;
  rebindPaneProcess?(oldWindowId: string, paneId: string, newWindowId: string, newPaneId?: string): void;
}

/**
 * TmuxCompatService 闂傚倸鍊搁崐鐑芥倿閿曗偓椤灝螣閼测晝鐓嬮梺鍓插亝濞叉﹢宕? */
export interface TmuxCompatServiceConfig {
  /** ProcessManager 闂傚倷娴囬褎顨ョ粙鍖¤€块梺顒€绉寸壕缁樹繆椤栨艾鎮戞い?*/
  processManager: ITmuxProcessManager;

  /** 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞?windowStore 闂傚倸鍊烽懗鍓佸垝椤栫偐鈧箓宕奸妷銉︽К闂佸搫绋侀崢濂告倿閸偁浜滈柟杈剧到閸旂敻鏌涜箛鎾存拱缂佺粯鐩畷濂告偄妞嬪簼绱濋柣搴ゎ潐濞叉﹢鎮烽埡鍛疇闁绘劕鎼敮闂佹寧姊婚悺鏃堝疮閳?*/
  getWindowStore: () => any;

  /** 闂傚倸鍊风粈渚€骞栭鈷氭椽濡舵径瀣槐闂侀潧艌閺呮盯鎷?windowStore 闂傚倸鍊烽悞锕傛儑瑜版帒绀夌€光偓閳ь剟鍩€椤掍礁鍤柛鎾跺枎閻ｇ兘鎮介崨濠勫姸閻庡箍鍎遍幊蹇涙倵?*/
  updateWindowStore: (updater: (state: any) => void) => void;

  /** pane 闂傚倷绀侀幖顐λ囬锕€鐤炬繝濠傛噽閻瑩鏌熼幑鎰靛殭闁绘挻绻堥弻锝夊箻閸愯尙妲伴梺鍝ュ枎閹虫﹢寮婚悢铏圭＜婵☆垵娅ｉ悷鏌ユ⒑缁嬪灝顒㈤柣鐔叉櫊瀵?*/
  onPaneProcessStarted?: (payload: { windowId: string; paneId: string; pid: number }) => void;

  /** pane 闂傚倷绀侀幖顐λ囬锕€鐤炬繝濠傛噽閻瑩鏌熼幑鎰靛殭闁绘挻绻堥弻锝夊箻閸愯尙妲伴梺鍝ュ枎閹虫﹢寮婚悢铏圭＜婵☆垵娅ｉ悷鎰磽娓氬洤鏋ょ紒顕呭灦楠炲牓濡搁妷銏℃杸闂佸憡娲﹂崑鍡樼妤ｅ啯鈷戦柟鑲╁仜婵℃悂鏌涢弬鍧楀弰妤犵偛顦甸獮姗€顢欓懞銉︾彸闂備焦鎮堕崕顕€寮插鍛亾?*/
  onPaneProcessStopped?: (payload: { windowId: string; paneId: string; pid?: number }) => void;

  /** 闂傚倷绀侀幖顐λ囬柆宥呯？闁圭増婢樼粈鍫熺箾閸℃ê绔惧ù?PTY 闂傚倸鍊峰ù鍥ь浖閵娾晜鍤勯柤绋跨仛濞呯姵淇婇妶鍌氫壕闂佷紮绲介悘姘辩箔閻旂厧鐒垫い鎺嗗亾闁伙絽鍢查～婵嬫嚋闂堟稐缃曢梻浣稿閸嬫挾绱為崱妞曟椽顢楅崟顑芥嫼闂佸憡绻傜€氼厼锕㈡导瀛樼厵闂侇偅绋栭崗宀勬煙楠炲灝鐏╅摶锝夋煠濞村娅囬柣?*/
  onPaneData?: (payload: { windowId: string; paneId: string; data: string; seq?: number }) => void;

  /** 闂傚倸鍊风粈渚€骞栭銈傚亾濮樺崬鍘寸€规洝顫夌€靛ジ寮堕幋鐘垫毎濠电偞鎸婚崺鍐磻閹惧灈鍋撶憴鍕８闁稿海鏁婚妴浣糕槈濮楀棛鍙嗛梺鍛婃处閸撴岸顢樿ぐ鎺撯拺闁煎鍊曞瓭濡炪倖鍨甸幊妯虹暦椤栫偛绠柤鎭掑劚閸撱劌顪冮妶鍡欏⒈闁稿绋撻悮鎯ь吋婢跺鍘繝銏ｆ硾閻楀棝宕濋妶鍥╃＜?*/
  debug?: boolean;
}

type PaneStartupBarrier = {
  pid: number;
  windowId: string;
  paneId: string;
  createdAt: number;
  sawVisibleOutput: boolean;
  sawDeviceAttributesRequest: boolean;
  promise: Promise<void>;
  resolve: (reason: 'visible-output' | 'renderer-da-reply' | 'timeout' | 'disposed' | 'replaced') => void;
};

type TmuxScopedLayoutMatch = {
  path: number[];
  node: LayoutNode;
  panes: Pane[];
};

/**
 * TmuxCompatService 闂傚倷娴囬褎顨ョ粙鍖¤€块梺顒€绉寸壕濠氭煟閺冨洤浜圭€规挷绶氶弻娑㈠Ψ閵忊剝鐝栭柣? *
 * 闂傚倸鍊风粈渚€骞栭銈囩煋闁割偅娲嶉埀顒婄畵瀹曞ジ濮€閵忋垹顦╁┑掳鍊х徊浠嬪疮椤栫偛鍚归柛灞惧閸嬫捇宕楁径濠佸闂備礁鎲￠崝锔界閻愬搫鍌ㄦい鎺戝閳? * 1. 闂傚倸鍊峰ù鍥綖婢跺顩插ù鐘差儏绾惧潡鏌＄仦璇插姎闁哄鑳堕幉鎼佹偋閸繄鐟ㄥ┑锛勫仧閺咁偊鍩€椤掆偓閸樻粓宕戦幘缁樼厱闁归偊鍓欓弳鐐烘偨椤栨せ鍋撻幇浣告?tmux 闂傚倸鍊风粈渚€骞夐敍鍕煓闁圭儤顨呴崹鍌涚節闂堟侗鍎忕紒鐙€鍣ｉ弻鏇㈠醇濠靛洤顦╅柣搴㈢瀹€绋款潖濞差亜鍨傛い鏇炴噹閸撳啿鈹戦悩顐壕? * 2. 缂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾闁诡喗妞芥俊鎼佹晜閽樺浼?tmux pane ID 闂傚倸鍊风粈渚€骞夐敍鍕殰婵°倐鍋撴い顓炵仢椤粓鍩€椤掑嫬绠栭柛褎顨呯粈瀣亜閺嶃劎鈻撻柟?(windowId, paneId) 闂傚倸鍊烽悞锕傛儑瑜版帒绀夌€光偓閳ь剟鍩€椤掍礁鍤柛妯煎帶瀹撳嫰鎮峰鍐缂? * 3. 缂傚倸鍊搁崐鐑芥嚄閼搁潧鍨旈悗闈涙啞椤洟鏌￠崶銉ョ仼缂佺姵鐗曢埞鎴︽偐閸欏顦╅梺璇″灣閸嬬偤骞堥妸銉建闁糕剝顨呯粻褰掓⒑?session/window 缂傚倸鍊搁崐鎼佸磹閻戣姤鍊块柨鏇炲€哥粻鏉库攽閻樺磭顣查柛? * 4. 闂傚倷娴囧畷鍨叏閹绢噮鏁勯柛娑欐綑閻ゎ喖霉閸忓吋缍戦柡瀣╃窔閺屾洟宕煎┑鎰ч梺绋款儐缁诲牓寮婚敐鍛傛棃鍩€椤掑嫭鍋嬪┑鐘插娑撳秹鏌熼悜姗嗘畷闁绘挻鐩弻娑㈩敃閿濆洨鐣奸悗娑欑箖缁绘繂鈻撻崹顔界亾闂佸摜濮甸悧鐘差嚕椤愩埄鍚嬪璺猴攻瀹撳秴顪冮妵鍗炴噽瑜扮珟essManager, LayoutOperations闂傚倸鍊烽悞锔锯偓绗涘懐鐭欓柟娆¤娲幃褔宕奸悢鍝ュ娇闂備椒绱徊浠嬪嫉椤掑嫬纾绘慨妞诲亾闁诡喗锕㈤幃娆撳垂椤愶絿褰ч梻浣告惈椤︻喚鍒掑▎蹇ｆ綎濠电姵鑹剧粈瀣亜閹板墎鍒版繛鍛€濆娲偡閼割剙浠梺琛″亾闂侇剙绉寸粻? * 5. 闂傚倸鍊风粈渚€骞栭銈囩煋闁割偅娲栭崒銊ф喐韫囨拹锝夊箛閻楀牊娅㈤梺缁橆焾鐏忔瑩藝闁秵鈷戦柛婵嗗閳诲鏌涢幘瀵搞€掔紒杈ㄧ懄缁绘繂顫濋鐘插箞闂備胶顢婇幓顏嗗緤妤ｅ啫违闁告劦鍠楅崑?tmux 濠电姷顣槐鏇㈠磻濞戙埄鏁勯柛娑卞灙閸嬫挸鈽夐幒鎾寸彋闂佽鍟崶褏顔愭繛杈剧悼閹虫捇宕滈銏♀拺闁告稑锕ユ径鍕煕鐎ｎ亝鍤囨鐐叉閳诲酣骞樺畷鍥跺晣? */
export class TmuxCompatService extends EventEmitter implements ITmuxCompatService {
  private config: TmuxCompatServiceConfig;
  private windowIdCounter: number = 0;

  /** tmux pane ID 闂傚倷娴囧畷鍨叏瀹曞洦濯奸柡灞诲劚缁€鍫熺節闂堟侗鍎忔慨瑙勭叀閺岋綁寮崒姘粯闂傚倸鍋嗛崹閬嶅Φ閸曨垼鏁囬柣鏃堫棑椤戝倻绱撴担鎻掍壕闂佸憡娲﹂崐?1 闂備浇顕х€涒晠顢欓弽顓炵獥闁圭儤顨呯壕濠氭煙閻愵剚鐏遍柡鈧懞銉ｄ簻闁哄啫鍊甸幏锟犳煕鎼淬垻鐭岀紒?*/
  private paneIdCounter: number = 1;

  /** tmux pane ID 闂?(windowId, paneId) 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂?*/
  private paneIdMap: Map<TmuxPaneId, { windowId: string; paneId: string }>;

  /** 闂傚倸鍊风粈渚€骞夐敓鐘冲仭闁靛／鍛厠闂佸湱铏庨崰鏍不閺嶃劎绡€濠电姴鍊绘晶鏇㈡煕濞嗗骏韬柡宀嬬到铻ｉ柛顭戝枤濮ｃ垹鈹? (windowId:paneId) 闂?tmux pane ID */
  private reversePaneIdMap: Map<string, TmuxPaneId>;

  /** 闂傚倸鍊烽悞锕傚磿瀹曞洦宕查柟瀵稿Т閺嬪牏鈧箍鍎卞ú鐘诲磻?session 闂傚倷娴囬褏鈧稈鏅濈划娆撳箳濡や焦娅旈梻? "namespace:sessionName" 闂?TmuxSession */
  private sessions: Map<string, TmuxSession>;

  /** RPC 闂傚倸鍊风粈渚€骞栭锔藉亱闁糕剝鐟ч惌鎾绘倵濞戞鎴﹀矗韫囨稒鐓熼柡鍐ㄥ€哥敮鍫曟⒒閸屻倕鐏﹂柡灞炬礃缁绘盯宕归鐓幮戦梻浣告惈椤﹀啿螞閸曨垰违?*/
  private rpcServer: TmuxRpcServer;

  /** Pane 闂傚倸鍊烽懗鍫曗€﹂崼銏″床闁圭増婢橀悿顔姐亜閺嶎偄浠滄慨瑙勭叀閺岋綁寮崒姘粯缂備胶濮村鍫曞Φ閸曨垰绫嶉柛銉戝倹鐫忛梻浣告贡閺咁偅绻涢埀顒勬煛? tmuxPaneId 闂?TmuxPaneMetadata */
  private paneMetadata: Map<TmuxPaneId, TmuxPaneMetadata>;

  /** tmux 闂傚倸鍊风粈渚€骞夐敍鍕殰婵°倕鍟伴惌娆撴煙鐎电啸缁?pane 闂?PTY 闂傚倸鍊峰ù鍥ь浖閵娾晜鍤勯柤绋跨仛濞呯姵淇婇妶鍌氫壕闂佷紮绲介悘姘跺箯閸涘瓨鍊绘俊顖欒閳ь剚鐩娲濞戞氨鐤勯梺绋匡攻閻楃娀鏁?*/
  private paneSubscriptions: Map<string, () => void>;
  private paneStartupBarriers: Map<string, PaneStartupBarrier>;
  private readonly PANE_STARTUP_BARRIER_TIMEOUT_MS = 1200;

  constructor(config: TmuxCompatServiceConfig) {
    super();
    this.config = config;
    this.paneIdMap = new Map();
    this.reversePaneIdMap = new Map();
    this.sessions = new Map();
    this.rpcServer = new TmuxRpcServer({
      tmuxCompatService: this,
      debug: config.debug,
      logFilePath: this.getTmuxDebugLogFilePath(),
    });
    this.paneMetadata = new Map();
    this.paneSubscriptions = new Map();
    this.paneStartupBarriers = new Map();
  }

  /**
   * 闂傚倸鍊风粈浣革耿闁秵鍋￠柟鎯版楠炪垽鏌嶉崫鍕偓褰掑级?tmux 闂傚倸鍊风粈渚€骞夐敍鍕煓闁圭儤顨呴崹鍌涚節闂堟侗鍎忕紒?   */
  async executeCommand(request: TmuxCommandRequest): Promise<TmuxCommandResponse> {
    try {
      this.debugLog(request, 'Executing command', {
        argv: request.argv,
        windowId: request.windowId,
        paneId: request.paneId,
        cwd: request.cwd,
        debugContext: request.debugContext,
      });

      const parsed = TmuxCommandParser.parse(request.argv);
      this.debugLog(request, 'Parsed command', {
        command: parsed.command,
        globalOptions: parsed.globalOptions,
        options: parsed.options,
        args: parsed.args,
      });

      const response = await (async () => {
        switch (parsed.command) {
          case TmuxCommand.Version:
            return this.handleVersion();

          case TmuxCommand.DisplayMessage:
            return this.handleDisplayMessage(parsed, request);

          case TmuxCommand.ListPanes:
            return this.handleListPanes(parsed, request);

          case TmuxCommand.SplitWindow:
            return this.handleSplitWindow(parsed, request);

          case TmuxCommand.SelectLayout:
            return this.handleSelectLayout(parsed, request);

          case TmuxCommand.ResizePane:
            return this.handleResizePane(parsed, request);

          case TmuxCommand.SendKeys:
            return this.handleSendKeys(parsed, request);

          case TmuxCommand.KillPane:
            return this.handleKillPane(parsed, request);

          case TmuxCommand.SelectPane:
            return this.handleSelectPane(parsed, request);

          case TmuxCommand.SetOption:
            return this.handleSetOption(parsed, request);

          case TmuxCommand.HasSession:
            return this.handleHasSession(parsed, request);

          case TmuxCommand.NewSession:
            return this.handleNewSession(parsed, request);

          case TmuxCommand.ListWindows:
            return this.handleListWindows(parsed, request);

          case TmuxCommand.NewWindow:
            return this.handleNewWindow(parsed, request);

          case TmuxCommand.BreakPane:
            return this.handleBreakPane(parsed, request);

          case TmuxCommand.JoinPane:
            return this.handleJoinPane(parsed, request);

          case TmuxCommand.KillSession:
            return this.handleKillSession(parsed, request);

          case TmuxCommand.SwitchClient:
            return this.handleSwitchClient(parsed, request);

          case TmuxCommand.AttachSession:
            return this.handleAttachSession(parsed, request);

          default:
            return {
              exitCode: 1,
              stdout: '',
              stderr: `tmux: unknown command: ${request.argv[0]}\n`,
            };
        }
      })();

      this.debugLog(request, 'Command result', this.summarizeResponse(response));
      return response;
    } catch (error: unknown) {
      console.error('[TmuxCompatService] Command execution error:', error);
      this.debugLog(request, 'Command execution error', error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error);
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  /**
   * 闂傚倸鍊风粈渚€骞夐敍鍕殰闁圭儤鍤﹀☉妯锋斀閻庯綆浜滈崑宥夋⒑闂堟稓澧曟い锔诲灠铻炴慨妞诲亾闁哄瞼鍠庨埢鎾诲垂椤旂晫浜堕梻?tmux pane ID
   */
  allocatePaneId(): TmuxPaneId {
    const id = `%${this.paneIdCounter++}`;
    return id;
  }

  /**
   * 闂傚倸鍊搁崐椋庢閿熺姴纾婚柛娑卞枤閳瑰秹鏌ц箛姘兼綈鐎?tmux pane ID 闂傚倸鍊风粈渚€骞栭銈嗗仏妞ゆ劧绠戠壕鍧楁煕濞嗗浚妲洪柣婵婂煐娣囧﹪顢涘杈ㄧ檨闂佺顑嗛幑鍥х暦閻戠瓔鏁囬柣鎰椤洘绻濈喊澶岀？闁惧繐閰ｅ畷褰掑醇閺囩偟鐣?window ID 闂?pane ID
   */
  resolvePaneId(tmuxPaneId: TmuxPaneId): { windowId: string; paneId: string } | null {
    return this.paneIdMap.get(tmuxPaneId) || null;
  }

  /**
   * 闂傚倸鍊搁崐椋庢閿熺姴纾婚柛娑卞枤閳瑰秹鏌ц箛姘兼綈鐎?window target 闂傚倷娴囧畷鐢稿窗閹扮増鍋￠弶鍫氭櫅缁躲倕螖閿濆懎鏆為柛?window ID
   *
   * 闂傚倸鍊峰ù鍥Υ閳ь剟鏌涚€ｎ偅灏伴柕鍥у瀵粙濡歌濡插牓姊烘导娆忕槣闁革綇缍佸濠氬灳閹颁礁鎮戦梺鎼炲劀閸愌呭笡缂?
   * - "session:0" 闂?闂傚倸鍊风粈渚€骞栭銈嗗仏妞ゆ劧绠戠壕鍧楁煕濞嗗浚妲洪柣?session 闂傚倸鍊烽悞锕傛儑瑜版帒绀夌€光偓閳ь剟鍩€椤掍礁鍤柛锝忕秮閵?0 濠?window
   * - "session:windowName" 闂?闂傚倸鍊风粈渚€骞栭銈嗗仏妞ゆ劧绠戠壕鍧楁煕濞嗗浚妲洪柣?session 濠电姷鏁搁崑鐐哄垂閸洖绠归柍鍝勬噹閸屻劌鈹戦崒婊庣劸缂佺姵鐗犻弻锟犲炊閳轰焦鐏侀梺?windowName 闂?window
   */
  resolveWindowTarget(target: TmuxWindowTarget, namespace: string = 'default'): string | null {
    if (target.startsWith('@')) {
      const tmuxWindowId = parseInt(target.slice(1), 10);
      if (Number.isNaN(tmuxWindowId)) {
        return null;
      }

      return this.findTmuxWindowByTmuxWindowId(tmuxWindowId, namespace)?.actualWindowId || null;
    }

    // 缂傚倸鍊搁崐鐑芥嚄閼稿灚鍙忔い鎾卞灩绾惧鏌熼崜褏甯涢柣鎾存礋閺屸€愁吋閸愩劌顬嬫繝鈷€灞奸偗闁哄矉缍佹俊鍫曞川椤撗傜磾闂備浇顕栭崰鏍椤撱垹鏋佹い鏇楀亾妞ゃ垺鐟╁畷婊嗩槾鐎规洖鐖煎缁樻媴娓氼垳鍔稿銈嗗灥閹冲海鍙呴梺鍐叉惈閹峰寮?target 闂傚倸鍊风粈渚€骞栭銈囩煋闁割偅娲栭崒銊ф喐韫囨拹锝夊箛閺夎法鍔撮梺鍛婂姦娴滄牠寮?"session:index"
    // 闂傚倷娴囬褎顨ョ粙鍖¤€块梺顒€绉寸壕濠氭煏閸繃濯奸柣搴ゅ煐閵囧嫰寮介妸銉闂佺顑嗛幑鍥х暦閻戠瓔鏁囬柣鎰閸╂稒淇婇妶鍥ラ柛瀣☉鐓ゆい鎾跺€ｅ☉娆戠懝闁逞屽墴瀹曟椽鍩€椤掍降浜滈柟鐑樺灥閳ь剙缍婂畷顖炲传閸旇棄缍婇弫鎰板川椤撶偟绱﹂梻浣告贡閸庛倝銆冮崨鏉戠?session 闂?window 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂?
    const parts = target.split(':');
    if (parts.length !== 2) {
      return null;
    }

    const [sessionName, windowIdentifier] = parts;
    const session = this.findSession(sessionName, namespace);
    if (!session) {
      return null;
    }

    if (windowIdentifier === '') {
      return session.windows.sort((left, right) => left.index - right.index)[0]?.actualWindowId || null;
    }

    // 闂傚倷娴囬褏鎹㈤幇顔藉床闁瑰濮靛畷鏌ユ煕閳╁啰鈯曢柛搴★攻閵囧嫰寮介顫捕缂備胶濮靛姗€鈥︾捄銊﹀磯濡わ箑鐏濋顓㈡⒑缁嬫鍎忕紒澶婄埣閸┾偓妞ゆ帊绶￠崯蹇涙煕閻樻剚娈旈悡銈嗘叏濡炶浜鹃梺璇″櫙缁绘繈寮幘缁樺亹闁肩⒈鍓﹂崥?

    const index = parseInt(windowIdentifier, 10);
    if (!isNaN(index)) {
      const tmuxWindow = session.windows.find((window) => window.index === index);
      return tmuxWindow?.actualWindowId || null;
    }

    // 闂傚倷娴囬褏鎹㈤幇顔藉床闁瑰濮靛畷鏌ユ煕閳╁啰鈯曢柛搴★攻閵囧嫰寮介顫捕缂備胶濮靛姗€鈥︾捄銊﹀磯闁绘艾鐡ㄩ弫楣冩⒑缁嬪尅宸ョ痪缁㈠幘濡叉劙骞掗幘宕囩獮闁诲繒鍋熼悺鏃堝汲椤撱垺鈷戠紓浣股戦幆鍫㈢磼缂佹绠為柣?

    const window = session.windows.find(w => w.name === windowIdentifier);
    return window?.actualWindowId || null;
  }

  /**
   * 婵犵數濮烽弫鎼佸磻濞戔懞鍥敇閵忕姷顦悗鍏夊亾闁告洦鍋夐崺?pane ID 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂?   */
  registerPane(tmuxPaneId: TmuxPaneId, windowId: string, paneId: string): void {
    const numericId = parseInt(tmuxPaneId.slice(1), 10);
    if (!Number.isNaN(numericId) && numericId >= this.paneIdCounter) {
      this.paneIdCounter = numericId + 1;
    }

    const reverseKey = `${windowId}:${paneId}`;
    const existingTmuxPaneId = this.reversePaneIdMap.get(reverseKey);
    if (existingTmuxPaneId && existingTmuxPaneId !== tmuxPaneId) {
      this.paneIdMap.delete(existingTmuxPaneId);
    }

    this.paneIdMap.set(tmuxPaneId, { windowId, paneId });
    this.reversePaneIdMap.set(reverseKey, tmuxPaneId);

    if (this.config.debug) {
      console.log(`[TmuxCompatService] Registered pane: ${tmuxPaneId} 闂?${windowId}:${paneId}`);
    }
  }

  /**
   * 婵犵數濮烽弫鎼佸磻濞戔懞鍥敇閵忕姷顦梺纭呮彧缁犳垹绱?pane ID 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂?   */
  unregisterPane(tmuxPaneId: TmuxPaneId): void {
    const mapping = this.paneIdMap.get(tmuxPaneId);
    if (mapping) {
      const reverseKey = `${mapping.windowId}:${mapping.paneId}`;
      this.reversePaneIdMap.delete(reverseKey);
    }
    this.paneIdMap.delete(tmuxPaneId);
    this.paneMetadata.delete(tmuxPaneId);

    if (this.config.debug) {
      console.log(`[TmuxCompatService] Unregistered pane: ${tmuxPaneId}`);
    }
  }

  /**
   * 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞存粌缍婇弻娑㈠Ψ椤旂厧顫╃紓浣哄缂嶄線寮婚垾宕囨殼妞ゆ梻鍘ч弳鐔访归悪鈧崣鍐箖?session
   */
  getOrCreateSession(sessionName: TmuxSessionName, namespace: string = 'default'): TmuxSession {
    const key = `${namespace}:${sessionName}`;
    let session = this.sessions.get(key);

    if (!session) {
      session = {
        name: sessionName,
        namespace,
        windows: [],
        createdAt: new Date().toISOString(),
      };
      this.sessions.set(key, session);

      if (this.config.debug) {
        console.log(`[TmuxCompatService] Created session: ${key}`);
      }
    }

    return session;
  }

  /**
   * 闂傚倸鍊风粈渚€骞栭銈嗗仏妞ゆ劧绠戠壕鍧楁煕濞嗗浚妲洪柣?session
   */
  private findSession(sessionName: TmuxSessionName, namespace: string = 'default'): TmuxSession | null {
    const key = `${namespace}:${sessionName}`;
    return this.sessions.get(key) || null;
  }

  /**
   * 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞存粌缍婇弻娑㈠Ψ椤旂厧顫╅悗鐟版啞缁诲牓寮婚悢琛″亾濞戞顏嗙箔濮橆兘鏀芥い鏂挎惈閻忔煡鏌″畝鈧崰鎾诲窗婵犲伣鐔告姜閺夋妫滈梻?namespace闂傚倸鍊烽悞锔锯偓绗涘懐鐭欓柟杈鹃檮閸嬪鏌涢埄鍐х繁闁轰礁顑嗛妵鍕籍閸ヮ灝鎾绘煕?tmux -L socket闂?   */
  private getNamespace(parsed: { globalOptions?: { socket?: string } }, request: TmuxCommandRequest): string {
    return request.namespace || parsed.globalOptions?.socket || 'default';
  }

  /**
   * 闂傚倸鍊搁崐椋庢閿熺姴纾婚柛娑卞枤閳瑰秹鏌ц箛姘兼綈鐎?windowId 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞?window
   */
  private getWindowById(windowId: string): Window | undefined {
    const store = this.config.getWindowStore();
    return store.windows.find((window: Window) => window.id === windowId);
  }

  /**
   * 闂傚倸鍊搁崐椋庢閿熺姴纾婚柛娑卞枤閳瑰秹鏌ц箛姘兼綈鐎规洘鐓￠弻娑㈠箛閸忓摜鎸夐梺绋款儐閹瑰洤鐣烽悜绛嬫晣闁绘劗澧楅～鏇熺節?windowId 闂傚倸鍊风粈渚€骞栭銈嗗仏妞ゆ劧绠戠壕鍧楁煕濞嗗浚妲洪柣?tmux window 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂?   */
  private findTmuxWindowByActualWindowId(windowId: string, namespace?: string) {
    for (const session of this.sessions.values()) {
      if (namespace && session.namespace !== namespace) {
        continue;
      }

      const tmuxWindow = session.windows.find((window) => window.actualWindowId === windowId);
      if (tmuxWindow) {
        return tmuxWindow;
      }
    }

    return null;
  }

  private findTmuxWindowByTmuxWindowId(tmuxWindowId: number, namespace?: string) {
    for (const session of this.sessions.values()) {
      if (namespace && session.namespace !== namespace) {
        continue;
      }

      const tmuxWindow = session.windows.find((window) => window.tmuxWindowId === tmuxWindowId);
      if (tmuxWindow) {
        return tmuxWindow;
      }
    }

    return null;
  }

  /**
   * 闂傚倷娴囬褏鎹㈤幇顔藉床闁归偊鍎靛☉妯滄棃宕ㄩ鐙€妲遍梻浣芥硶閸犳挻鎱ㄧ€电硶鍋?workspace window 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂闂備胶绮…鍫ヮ敋瑜忕划鍫ュ幢濡炴洖缍婇幃鈩冩償椤斿吋顔嶉梺姹囧焺閸ㄩ亶鎯勯鐐茬畺?session
   */
  private ensureWorkspaceWindowMapped(
    windowId: string,
    namespace: string = 'default',
    sessionName: string = 'default',
  ) {
    const existing = this.findTmuxWindowByActualWindowId(windowId, namespace);
    if (existing) {
      return existing;
    }

    const window = this.getWindowById(windowId);
    if (!window) {
      return null;
    }

    return this.registerTmuxWindow(sessionName, namespace, windowId, window.name, false, false);
  }

  /**
   * 婵犵數濮烽弫鎼佸磻濞戔懞鍥敇閵忕姷顦悗鍏夊亾闁告洦鍋夐崺?tmux window 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂?   */
  private registerTmuxWindow(
    sessionName: string,
    namespace: string,
    actualWindowId: string,
    name: string,
    managed: boolean,
    hidden: boolean,
  ) {
    const session = this.getOrCreateSession(sessionName, namespace);
    const nextIndex = session.windows.length === 0
      ? 0
      : Math.max(...session.windows.map((window) => window.index)) + 1;

    const tmuxWindow = {
      tmuxWindowId: this.windowIdCounter++,
      index: nextIndex,
      name,
      actualWindowId,
      sessionName,
      managed,
      hidden,
    };

    session.windows.push(tmuxWindow);
    session.windows.sort((left, right) => left.index - right.index);
    return tmuxWindow;
  }

  /**
   * 濠?session 濠电姷鏁搁崑鐐哄垂閸洖绠归柍鍝勬噹閸屻劑鏌涘▎宥呭姢闁哄嫬鍊垮濠氬磼濮橆兘鍋撻崫銉㈠亾濮樸儱濮傜€规洘鍔欏鎾閳ュ厖鐥梻浣告啞濞诧箓宕归柆宥呯厱?window 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂?   */
  private removeTmuxWindowByActualWindowId(actualWindowId: string): void {
    for (const session of this.sessions.values()) {
      session.windows = session.windows.filter((window) => window.actualWindowId !== actualWindowId);
    }
  }

  /**
   * 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞?window 闂傚倷娴囬褍霉閻戣棄鏋侀柟闂寸缁犵娀鏌熼悙顒€鍔跺┑顔藉▕閺岋紕浠︾拠鎻掑闂?tmux 濠电姷鏁搁崑鐐哄垂閸洖绠伴柟闂寸劍閺呮繈鏌ㄥ┑鍡樺窛缂佺姵妫冮弻娑樷槈濞嗘劗绋囧┑?   */
  private getTmuxWindowContext(windowId?: string, namespace: string = 'default') {
    if (!windowId) {
      return {
        sessionName: 'default',
        tmuxWindowId: '',
        windowIndex: 0,
        windowName: '',
      };
    }

    const mapped = this.findTmuxWindowByActualWindowId(windowId, namespace)
      || this.ensureWorkspaceWindowMapped(windowId, namespace);

    if (!mapped) {
      const window = this.getWindowById(windowId);
      return {
        sessionName: 'default',
        tmuxWindowId: '',
        windowIndex: 0,
        windowName: window?.name || '',
      };
    }

    return {
      sessionName: mapped.sessionName,
      tmuxWindowId: `@${mapped.tmuxWindowId}`,
      windowIndex: mapped.index,
      windowName: mapped.name,
    };
  }

  /**
   * 闂傚倸鍊风粈渚€骞栭鈷氭椽濡舵径瀣槐闂侀潧艌閺呮盯鎷?pane 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂闂備胶绮…鍫ヮ敋瑜忕划鍫ュ幢濞戞瑧鍘藉┑掳鍊愰崑鎾绘煟濡も偓閿曨亪骞冮敓鐘茬劦妞ゆ帒瀚埛鎴炴叏閻熺増鎼愬┑鈥炽偢閹顫濋悡搴♀拫闂佽鍠栧鈥崇暦閻旂⒈鏁嶆繛鎴炲笚鐎?window/pane
   */
  private rebindPaneMapping(tmuxPaneId: TmuxPaneId, windowId: string, paneId: string): void {
    const current = this.paneIdMap.get(tmuxPaneId);
    if (current) {
      const previousReverseKey = `${current.windowId}:${current.paneId}`;
      this.reversePaneIdMap.delete(previousReverseKey);
    }

    this.paneIdMap.set(tmuxPaneId, { windowId, paneId });
    this.reversePaneIdMap.set(`${windowId}:${paneId}`, tmuxPaneId);
  }

  /**
   * 闂傚倸鍊风粈渚€骞夐敓鐘冲仭闁挎洖鍊搁崹鍌炴煕瑜庨〃鍛存倿?window 闂傚倸鍊风粈渚€骞夐敓鐘冲殞濡わ絽鍟€氬銇勯幒鎴濐伌闁轰礁妫濋弻锝夊箛椤掑娈跺銈傛櫆閻擄繝骞冨Δ鍛櫜闁稿本绋掗悵鏇烆渻閵堝棗濮夐柡鍜佸亞濡叉劙骞樼€涙ê顎撻梺闈╁瘜閸樹粙宕抽銏＄厽闁绘柨鎲＄粈鈧┑鈽嗗亝缁诲倿顢氶敐鍡欑瘈婵﹩鍓涢鎺楁⒑闂堚晛鐦滈柛姗€绠栭、娆撳箳閺冨倻锛?   */
  private emitWindowSynced(windowId: string): void {
    const window = this.getWindowById(windowId);
    if (window) {
      this.emit('window-synced', { window });
    }
  }

  /**
   * 闂傚倸鍊风粈渚€骞夐敓鐘冲仭闁挎洖鍊搁崹鍌炴煕瑜庨〃鍛存倿?window 闂傚倸鍊风粈渚€骞夐敍鍕殰闁绘劕顕粻楣冩煃瑜滈崜姘辨崲濞戙垹宸濇い鎾跺剱閸斿绱撴担绋库偓鍝ョ矓閸洖鐒垫い鎺戯功瀹€娑㈡煛閸涱喚鐭掓い銏℃礋閹儳鐣濋埀顒傚閽樺褰掓晲閸涱喛纭€闂佺懓鍟跨€氫即骞冮悜钘夊嵆闁绘劖鎯屽Λ锕傛倵濞堝灝鏋涙い顓犲厴閻涱喖顫滈埀顒€鐣烽悜绛嬫晣闁绘瑢鍋撻柛鐔奉儑缁?   */
  private emitWindowRemoved(windowId: string): void {
    this.emit('window-removed', { windowId });
  }

  /**
   * 闂傚倸鍊风粈渚€骞夐敓鐘茬鐟滅増甯掗崹鍌炴煟濡も偓閻楀﹪宕?pane 闂傚倷绀侀幖顐λ囬锕€鐤炬繝濠傜墕缁€澶嬫叏濡炶浜鹃梺闈涙缁舵岸鐛€ｎ喗鏅濋柍褜鍓涢悮鎯ь吋婢跺鍘鹃梺褰掓？缁€渚€鍩€椤掑啴鍝虹€垫澘瀚伴獮鍥敆閸屻倕鏁介梻鍌欑窔濞佳囁囨禒瀣瀭鐎规洖娲ㄩ惌鍡涙煕閹寸姵宸漎 闂傚倸鍊峰ù鍥ь浖閵娾晜鍤勯柤绋跨仛濞呯姵淇婇妶鍌氫壕闂?+ 闂傚倸鍊烽懗鍓佸垝椤栫偐鈧箓宕奸妷銉︽К闂佸搫绋侀崢濂告倿閸偁浜滈柟瀵稿仜椤曟粎绱掓担宄板祮闁哄矉缍佹俊鍫曞川椤曞懏锟ラ梻浣哥秺椤ユ挻绻涢埀顒勬煥濠靛牆浠辨い銏＄懇瀹曟粏顧佹俊?   */
  private attachPaneRuntime(windowId: string, paneId: string, pid: number): void {
    this.config.onPaneProcessStarted?.({ windowId, paneId, pid });

    const existing = this.paneSubscriptions.get(paneId);
    if (existing) {
      existing();
      this.paneSubscriptions.delete(paneId);
    }

    const shouldSubscribeToPtyData = this.config.processManager.subscribePtyData
      && (this.config.onPaneData || this.paneStartupBarriers.has(paneId));

    if (shouldSubscribeToPtyData && this.config.processManager.subscribePtyData) {
      const unsubscribe = this.config.processManager.subscribePtyData(pid, (data: string, seq?: number) => {
        this.releasePaneStartupBarrierOnOutput(paneId, data);
        this.config.onPaneData?.({ windowId, paneId, data, seq });
      });

      this.paneSubscriptions.set(paneId, unsubscribe);
    }
  }

  /**
   * 婵犵數濮烽弫鎼佸磻閻愬搫绠伴柟闂寸缁犵娀鏌熼悧鍫熺凡缂?pane 闂傚倷绀侀幖顐λ囬锕€鐤炬繝濠傜墕缁€澶嬫叏濡炶浜鹃梺闈涙缁舵岸鐛€ｎ喗鏅濋柍褜鍓涢悮鎯ь吋婢跺鍘鹃梺褰掓？缁€渚€鍩€椤掑啴鍝虹€垫澘瀚伴獮鍥敆閸屻倕鏁?   */
  private detachPaneRuntime(windowId: string, paneId: string, pid?: number): void {
    const unsubscribe = this.paneSubscriptions.get(paneId);
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {}
      this.paneSubscriptions.delete(paneId);
    }

    this.clearPaneStartupBarrier(paneId, 'disposed');
    this.config.onPaneProcessStopped?.({ windowId, paneId, pid });
  }

  /**
   * 闂傚倸鍊烽悞锕傛儑瑜版帒鍨傚┑鐘宠壘缁愭鏌熼悧鍫熺凡闁搞劌鍊归幈銊ノ熼幐搴ｃ€愬┑鈽嗗亝閿曘垽寮婚悢灏佹灁闁割煈鍠楅悘宥夋⒑娴兼瑧绉ù婊冪埣瀵鈽夐姀鐘电杸濡炪倖甯婄粈浣糕枔濡ゅ懏鈷?window闂傚倸鍊烽悞锔锯偓绗涘懐鐭欓柟杈鹃檮閸嬪鐓崶銊р槈闁哄绶氶弻鏇㈠醇濠靛浂妫ゅ?new-session/new-window/break-pane闂?   */
  private createInternalWindow(name: string, pane: Pane, archived: boolean = false): Window {
    return {
      id: randomUUID(),
      name,
      layout: {
        type: 'pane',
        id: pane.id,
        pane,
      },
      activePaneId: pane.id,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      archived,
    };
  }

  /**
   * 闂傚倸鍊风粈渚€骞夐敓鐘茬鐟滅増甯掗崹鍌炴煟濡も偓閻楀﹪宕?pane 闂?PTY shell闂傚倸鍊烽悞锔锯偓绗涘懐鐭欓柟杈鹃檮閸ゆ劖銇勯弽顐沪闁搞倖鍔欓弻锝夊籍閸屾艾浠樼紓?pid/status 闂傚倸鍊烽悞锕傚箖閸洖纾块柟鎯版绾剧粯绻涢幋娆忕仼闁汇値鍣ｉ弻鐔煎箲閹伴潧娈紓浣插亾?store
   */
  private async spawnPaneShell(
    windowId: string,
    paneId: string,
    cwd: string,
    command?: string,
  ): Promise<number | null> {
    const handle = await this.config.processManager.spawnTerminal({
      windowId,
      paneId,
      workingDirectory: cwd,
      command,
    });

    this.config.updateWindowStore((state: any) => {
      const window = state.windows.find((item: Window) => item.id === windowId);
      if (!window) {
        return;
      }

      const pane = this.findPane(windowId, paneId);
      if (pane) {
        pane.pid = handle.pid;
        pane.status = WindowStatus.WaitingForInput;
      }
    });

    this.registerPaneStartupBarrier(windowId, paneId, handle.pid);
    this.attachPaneRuntime(windowId, paneId, handle.pid);
    return handle.pid;
  }

  private registerPaneStartupBarrier(windowId: string, paneId: string, pid: number): void {
    if (process.platform !== 'win32') {
      return;
    }

    this.clearPaneStartupBarrier(paneId, 'replaced');

    let settled = false;
    let resolvePromise!: () => void;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    let barrier!: PaneStartupBarrier;
    const timeout = setTimeout(() => {
      barrier.resolve('timeout');
    }, this.PANE_STARTUP_BARRIER_TIMEOUT_MS);

    barrier = {
      pid,
      windowId,
      paneId,
      createdAt: Date.now(),
      sawVisibleOutput: false,
      sawDeviceAttributesRequest: false,
      promise,
      resolve: (reason) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        this.paneStartupBarriers.delete(paneId);
        this.debugLog(undefined, 'pane startup barrier released', {
          windowId,
          paneId,
          pid,
          reason,
          waitedMs: Date.now() - barrier.createdAt,
        });
        resolvePromise();
      },
    };

    this.paneStartupBarriers.set(paneId, barrier);
    this.debugLog(undefined, 'pane startup barrier registered', {
      windowId,
      paneId,
      pid,
      timeoutMs: this.PANE_STARTUP_BARRIER_TIMEOUT_MS,
    });
  }

  private async waitForPaneStartupBarrier(windowId: string, paneId: string, request?: TmuxCommandRequest): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }

    const barrier = this.paneStartupBarriers.get(paneId);
    if (!barrier) {
      return;
    }

    this.debugLog(request, 'waiting for pane startup barrier', {
      windowId,
      paneId,
      pid: barrier.pid,
      ageMs: Date.now() - barrier.createdAt,
    });
    await barrier.promise;
  }

  private clearPaneStartupBarrier(
    paneId: string,
    reason: 'visible-output' | 'renderer-da-reply' | 'timeout' | 'disposed' | 'replaced',
  ): void {
    const barrier = this.paneStartupBarriers.get(paneId);
    if (!barrier) {
      return;
    }

    barrier.resolve(reason);
  }

  private releasePaneStartupBarrierOnOutput(paneId: string, data: string): void {
    const barrier = this.paneStartupBarriers.get(paneId);
    if (!barrier) {
      return;
    }

    if (this.hasDeviceAttributesRequest(data)) {
      barrier.sawDeviceAttributesRequest = true;
      this.debugLog(undefined, 'pane startup barrier saw DA request', {
        windowId: barrier.windowId,
        paneId: barrier.paneId,
        pid: barrier.pid,
      });
    }

    if (!this.hasVisibleTerminalOutput(data)) {
      return;
    }

    barrier.sawVisibleOutput = true;

    if (!barrier.sawDeviceAttributesRequest) {
      this.clearPaneStartupBarrier(paneId, 'visible-output');
    }
  }

  notifyPaneInputWritten(
    windowId: string,
    paneId: string | undefined,
    data: string,
    metadata?: PtyWriteMetadata,
  ): void {
    if (process.platform !== 'win32' || !paneId) {
      return;
    }

    const barrier = this.paneStartupBarriers.get(paneId);
    if (!barrier || barrier.windowId !== windowId) {
      return;
    }

    if (!barrier.sawDeviceAttributesRequest || !this.hasDeviceAttributesResponse(data)) {
      return;
    }

    this.debugLog(undefined, 'pane startup barrier saw renderer DA reply', {
      windowId,
      paneId,
      pid: barrier.pid,
      sawVisibleOutput: barrier.sawVisibleOutput,
    });
    this.clearPaneStartupBarrier(paneId, 'renderer-da-reply');
  }

  private hasDeviceAttributesRequest(data: string): boolean {
    return data.includes('\x1b[c');
  }

  private hasDeviceAttributesResponse(data: string): boolean {
    return data.includes('\x1b[?1;2c');
  }

  private hasVisibleTerminalOutput(data: string): boolean {
    if (!data) {
      return false;
    }

    const withoutOsc = data.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '');
    const withoutCsi = withoutOsc.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
    const withoutSingleEsc = withoutCsi.replace(/\x1b[@-_]/g, '');
    const withoutControlChars = withoutSingleEsc.replace(/[\x00-\x1f\x7f]/g, '');
    return withoutControlChars.trim().length > 0;
  }

  /**
   * 濠?workspace 濠电姷鏁搁崑鐐哄垂閸洖绠归柍鍝勬噹閸屻劑鏌涘▎宥呭姢闁哄嫬鍊垮?window
   */
  private removeWindowFromStore(windowId: string): void {
    this.config.updateWindowStore((state: any) => {
      state.windows = state.windows.filter((window: Window) => window.id !== windowId);
    });
  }

  /**
   * 婵犵數濮烽弫鎼佸磿閹寸姷绀婇柍褜鍓氶妵鍕即閸℃顏柛娆忕箻閺岋綁骞囬浣瑰創濠?window 闂?workspace store
   */
  private addWindowToStore(window: Window): void {
    this.config.updateWindowStore((state: any) => {
      state.windows.push(window);
    });
  }

  /**
   * 闂?pane 闂傚倷绀侀幖顐λ囬锕€鐤鹃柣鎰棘濞戙垹绀嬫い鎺嶇瀵潡姊虹紒妯哄闁圭⒈鍋嗙划鍫ュ幢濞戞瑧鍘靛┑鐐茬墕閻忔繈寮搁悢铏圭＜闁归偊鍙庡▓婊堟煛?window闂傚倸鍊烽悞锔锯偓绗涘懐鐭欓柟杈鹃檮閸嬪鏌涘☉鍗炵仯缂佲偓婵犲洦鐓涢柛鎰剁到娴滃墽绱撴担鍓插剰妞わ妇鏁婚獮鍐煥閸忓墽鍠栭幃鈩冩償椤旂瓔妫?split 闂傚倸鍊烽悞锕傛儑瑜版帒绀夌€光偓閳ь剟鍩€椤掍礁鍤柛娆忓暙椤曪絿绱掑Ο鑲╃槇闂佸憡娲忛崝灞剧閻愵剛绠鹃柟瀵稿仧閹冲啫鈹戦鑹板闁宠鍨块崺銉╁幢濡も偓缁秹姊虹拠鈥虫灍闁荤啿鏅犻獮鍡涘磼閻愯弓绱堕梺闈涳紡鐏炴嫎?   */
  private appendPaneToWindow(windowId: string, pane: Pane, direction: 'horizontal' | 'vertical'): void {
    this.config.updateWindowStore((state: any) => {
      const window = state.windows.find((item: Window) => item.id === windowId);
      if (!window) {
        throw new Error('Window not found');
      }

      const oldRoot = window.layout;
      window.layout = {
        type: 'split',
        direction,
        sizes: [0.5, 0.5],
        children: [
          oldRoot,
          {
            type: 'pane',
            id: pane.id,
            pane,
          },
        ],
      };
    });
  }

  /**
   * 濠?target 濠电姷鏁搁崑鐐哄垂閸洖绠归柍鍝勬噹閸屻劑鏌涙繝鍕瀭濞存粎鎳撻妴鎺戭潩閿濆懍澹曢柣?session 闂傚倸鍊风粈渚€骞夐敓鐘冲殞闁告挆鍛厠闂佽鍨辨竟瀣矗?   */
  private getSessionNameFromTarget(target: string): string {
    const targetInfo = TmuxCommandParser.parseTarget(target);
    if (targetInfo.sessionName) {
      return targetInfo.sessionName;
    }
    if (target.includes(':')) {
      return target.split(':', 1)[0];
    }
    return target;
  }

  /**
   * 闂?pane 闂傚倷绀侀幖顐λ囬锕€鐤炬繝濠傛噽閻瑩鏌熼幑鎰靛殭闁绘挻绻堥弻娑滅疀濮橆兛姹楀銈傛櫇閸忔﹢鐛弽顬ュ酣顢楅埀顒勬倶椤忓牊鐓?window 闂傚倸鍊搁崐鐑芥倿閿曚降浜归柛鎰典簽閻捇鏌ｉ姀銏╃劸闁藉啰鍠庨埞鎴︽偐閹绘帩浼€缂佺偓鍎抽妶鎼佸蓟閻旇　鍋撳☉娆樼劷缂佺姵锕㈤弻锟犲幢閺囩偛绁梺鍝勬湰閻╊垶鐛幒妤€妫樻繛鍡欏亾濮ｅ姊?window
   */
  private movePaneRuntime(oldWindowId: string, paneId: string, newWindowId: string): void {
    const pid = this.config.processManager.getPidByPane(oldWindowId, paneId);
    this.detachPaneRuntime(oldWindowId, paneId, pid ?? undefined);
    this.config.processManager.rebindPaneProcess?.(oldWindowId, paneId, newWindowId, paneId);
    if (pid) {
      this.attachPaneRuntime(newWindowId, paneId, pid);
    }
  }

  /**
   * 闂傚倸鍊搁崐椋庣矆娴ｉ缚濮抽梺顒€绉寸壕濠氭煙閹呮憼闁告瑥绻橀弻銊モ攽閸℃浼€闂佸憡鏌ㄧ粔鐢垫崲濠靛鐒垫い鎺戝閻愬﹥銇勯幒鍡椾壕缂備讲鍋?   */
  destroy(): void {
    // 闂傚倸鍊烽懗鍫曗€﹂崼銏″床闁瑰鍋熺粻鎯р攽閻樿弓杩?RPC 闂傚倸鍊风粈渚€骞栭锔藉亱闁糕剝鐟ч惌鎾绘倵濞戞鎴﹀矗韫囨稒鐓熼柡鍐ㄥ€哥敮鍫曟⒒?
    this.rpcServer.destroy().catch((error: unknown) => {
      console.error('[TmuxCompatService] Failed to destroy RPC server:', error);
    });

    this.paneIdMap.clear();
    this.reversePaneIdMap.clear();
    this.sessions.clear();
    this.paneMetadata.clear();
    for (const unsubscribe of this.paneSubscriptions.values()) {
      try {
        unsubscribe();
      } catch {}
    }
    this.paneSubscriptions.clear();
    for (const barrier of this.paneStartupBarriers.values()) {
      barrier.resolve('disposed');
    }
    this.paneStartupBarriers.clear();
    this.removeAllListeners();
  }

  /**
   * 濠电姷鏁搁崑鐐哄垂閸洖绠板Δ锝呭暙绾惧潡鏌曢崼婵囩闁稿鎹囧畷褰掝敃閿濆洦顓婚梻?window 闂傚倸鍊风粈渚€骞夐敓鐘茬鐟滅増甯掗崹鍌炴煟濡も偓閻楀﹪宕?RPC 闂傚倸鍊风粈渚€骞栭锔藉亱闁糕剝鐟ч惌鎾绘倵濞戞鎴﹀矗韫囨稒鐓熼柡鍐ㄥ€哥敮鍫曟⒒?   *
   * @returns socket 闂傚倷娴囧畷鍨叏瀹曞洦濯伴柨鏇炲€搁崹鍌炴煙濞堝灝鏋熸い鎰矙閺岋綁骞囬鐓庡闂佸搫鎷嬮崜鐔煎蓟濞戙埄鏁冮柣妯垮皺娴犻箖姊洪崫鍕棞缂佺粯鍔欏﹢浣糕攽閻樿宸ラ柛鐕佸亰椤㈡濮€閵堝棛鍘告繛杈剧到閹碱偅绂掓潏鈹惧亾鐟欏嫭绀冩い銊ワ攻娣囧﹪鎮滈挊澹┿劑鏌曟竟顖氬暙缁楁捇姊婚崒娆掑厡缂侇噮鍨抽崚鎺楁偐鐠囨彃鐎繛鏉戝悑閻ｎ亪鍩€椤掆偓閸婃寧淇婇幖浣哥厸濞达綀娅ｉ崢顒佺節濞堝灝鏋熼柕鍥ㄧ洴瀹曟垿骞樼紒妯煎幈?AUSOME_TMUX_RPC闂?   */
  async ensureRpcServer(windowId: string): Promise<string> {
    const socketPath = this.rpcServer.getSocketPath(windowId);
    if (this.rpcServer.hasServer(windowId)) {
      // 健康检查：Unix socket 文件可能被系统清理（macOS /tmp 清理），需要重建
      if (process.platform !== 'win32' && !fs.existsSync(socketPath)) {
        this.appendTmuxDebugFile(undefined, 'Socket file missing, rebuilding RPC server', { windowId, socketPath });
        const startedPath = await this.rpcServer.startServer(windowId);
        this.appendTmuxDebugFile(undefined, 'RPC server rebuilt', { windowId, socketPath: startedPath });
        return startedPath;
      }
      this.appendTmuxDebugFile(undefined, 'RPC server already active', { windowId, socketPath });
      return socketPath;
    }

    this.appendTmuxDebugFile(undefined, 'Starting RPC server', { windowId, socketPath });
    const startedPath = await this.rpcServer.startServer(windowId);
    this.appendTmuxDebugFile(undefined, 'RPC server started', { windowId, socketPath: startedPath });
    return startedPath;
  }

  async startRpcServer(windowId: string): Promise<string> {
    const socketPath = this.rpcServer.getSocketPath(windowId);
    this.appendTmuxDebugFile(undefined, 'Restarting RPC server', { windowId, socketPath });
    const startedPath = await this.rpcServer.startServer(windowId);
    this.appendTmuxDebugFile(undefined, 'RPC server started', { windowId, socketPath: startedPath });
    return startedPath;
  }

  /**
   * 闂傚倸鍊烽懗鍫曗€﹂崼銉晞闁糕剝鐟ラ崹婵堚偓骞垮劚椤︿粙寮崱妯肩闁瑰瓨鐟ラ悘鈺冪磼閻樺崬宓嗛柡灞剧洴婵＄兘骞嬪┑鍥ф濠?window 闂?RPC 闂傚倸鍊风粈渚€骞栭锔藉亱闁糕剝鐟ч惌鎾绘倵濞戞鎴﹀矗韫囨稒鐓熼柡鍐ㄥ€哥敮鍫曟⒒?   */
  async stopRpcServer(windowId: string): Promise<void> {
    const socketPath = this.rpcServer.getSocketPath(windowId);
    this.appendTmuxDebugFile(undefined, 'Stopping RPC server', { windowId, socketPath });
    await this.rpcServer.stopServer(windowId);
    this.appendTmuxDebugFile(undefined, 'RPC server stopped', { windowId, socketPath });
  }

  /**
   * 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞存粌缍婇弻娑㈠Ψ椤旂厧顫╃紓浣哄С閸楁娊寮诲☉銏犖ㄩ柟瀛樼箖閸ｇ儤鎱?window 闂?RPC socket 闂傚倷娴囧畷鍨叏瀹曞洦濯伴柨鏇炲€搁崹鍌炴煙濞堝灝鏋熸い?   */
  getRpcSocketPath(windowId: string): string {
    return this.rpcServer.getSocketPath(windowId);
  }

  /**
   * 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞?window 闂傚倸鍊烽悞锕傛儑瑜版帒绀夌€光偓閳ь剟鍩€椤掍礁鍤柛妯圭矙瀵尙鎹勬笟顖氭倯婵犮垼娉涢敃銈夋偟?panes
   */
  private getAllPanes(windowId: string): Pane[] {
    const store = this.config.getWindowStore();
    const window = store.windows.find((w: Window) => w.id === windowId);
    if (!window) {
      return [];
    }

    const panes: Pane[] = [];
    const collectPanes = (node: LayoutNode) => {
      if (node.type === 'pane') {
        panes.push(node.pane);
      } else {
        node.children.forEach(collectPanes);
      }
    };

    collectPanes(window.layout);
    return panes;
  }

  private getAllTerminalPanes(windowId: string): Pane[] {
    return this.getAllPanes(windowId).filter((pane) => isTerminalPane(pane));
  }

  /**
   * 闂傚倸鍊风粈渚€骞栭銈嗗仏妞ゆ劧绠戠壕鍧楁煕濞嗗浚妲洪柣?pane
   */
  private findPane(windowId: string, paneId: string): Pane | null {
    const panes = this.getAllPanes(windowId);
    return panes.find(p => p.id === paneId) || null;
  }

  private hasStrongTmuxAgentMarker(pane: Pane): boolean {
    return Boolean(
      pane.teamName
      || pane.agentId
      || pane.agentName
      || pane.agentColor
    );
  }

  private hasWeakTmuxAgentMarker(pane: Pane): boolean {
    return Boolean(
      pane.title
      || pane.borderColor
      || pane.activeBorderColor
      || pane.teammateMode === 'tmux'
    );
  }

  private isTmuxAgentPane(pane: Pane): boolean {
    return this.hasStrongTmuxAgentMarker(pane) || this.hasWeakTmuxAgentMarker(pane);
  }

  private sanitizePaneForTmuxTeardown(pane: Pane): Pane {
    const {
      sessionId,
      lastOutput,
      title,
      borderColor,
      activeBorderColor,
      teamName,
      agentId,
      agentName,
      agentColor,
      teammateMode,
      tmuxScopeId,
      ...restPane
    } = pane;

    return {
      ...restPane,
      status: WindowStatus.Paused,
      pid: null,
    };
  }

  private getPaneToKeepAfterTmuxTeardown(panes: Pane[]): Pane {
    return panes.find((pane) => !this.isTmuxAgentPane(pane))
      || panes.find((pane) => !this.hasStrongTmuxAgentMarker(pane))
      || panes[0];
  }

  private assignPaneScopeInLayout(node: LayoutNode, paneId: string, scopeId: string): boolean {
    if (node.type === 'pane') {
      if (node.id !== paneId) {
        return false;
      }

      node.pane.tmuxScopeId = scopeId;
      return true;
    }

    for (const child of node.children) {
      if (this.assignPaneScopeInLayout(child, paneId, scopeId)) {
        return true;
      }
    }

    return false;
  }

  private findScopedLayoutMatch(
    node: LayoutNode,
    matchesPane: (pane: Pane) => boolean,
    path: number[] = [],
  ): TmuxScopedLayoutMatch | null {
    if (node.type === 'pane') {
      return matchesPane(node.pane)
        ? { path, node, panes: [node.pane] }
        : null;
    }

    const childMatches = node.children
      .map((child, childIndex) => this.findScopedLayoutMatch(child, matchesPane, [...path, childIndex]))
      .filter((match): match is TmuxScopedLayoutMatch => match !== null);

    if (childMatches.length === 0) {
      return null;
    }

    if (childMatches.length === 1) {
      return childMatches[0];
    }

    return {
      path,
      node,
      panes: childMatches.flatMap((match) => match.panes),
    };
  }

  private replaceLayoutNodeAtPath(
    layout: LayoutNode,
    path: number[],
    replacement: LayoutNode,
  ): LayoutNode {
    if (path.length === 0) {
      return replacement;
    }

    if (layout.type !== 'split') {
      return layout;
    }

    const [childIndex, ...restPath] = path;
    const targetChild = layout.children[childIndex];
    if (!targetChild) {
      return layout;
    }

    const nextChild = this.replaceLayoutNodeAtPath(targetChild, restPath, replacement);
    if (nextChild === targetChild) {
      return layout;
    }

    return {
      ...layout,
      children: layout.children.map((child, index) => (
        index === childIndex ? nextChild : child
      )),
    };
  }

  private createPaneNode(pane: Pane): LayoutNode {
    return {
      type: 'pane',
      id: pane.id,
      pane,
    };
  }

  private buildMainVerticalLayout(panes: Pane[]): LayoutNode {
    if (panes.length === 0) {
      throw new Error('Cannot build layout without panes');
    }

    if (panes.length === 1) {
      return this.createPaneNode(panes[0]);
    }

    const leaderPane = panes[0];
    const teammatesPanes = panes.slice(1);
    const teammatesLayout: LayoutNode = teammatesPanes.length === 1
      ? this.createPaneNode(teammatesPanes[0])
      : {
          type: 'split',
          direction: 'vertical',
          sizes: Array(teammatesPanes.length).fill(1 / teammatesPanes.length),
          children: teammatesPanes.map((pane) => this.createPaneNode(pane)),
        };

    return {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.3, 0.7],
      children: [
        this.createPaneNode(leaderPane),
        teammatesLayout,
      ],
    };
  }

  private buildTiledLayout(panes: Pane[]): LayoutNode {
    if (panes.length === 0) {
      throw new Error('Cannot build layout without panes');
    }

    if (panes.length === 1) {
      return this.createPaneNode(panes[0]);
    }

    const cols = Math.ceil(Math.sqrt(panes.length));
    const rows = Math.ceil(panes.length / cols);
    const rowNodes: LayoutNode[] = [];

    for (let row = 0; row < rows; row += 1) {
      const startIdx = row * cols;
      const endIdx = Math.min(startIdx + cols, panes.length);
      const rowPanes = panes.slice(startIdx, endIdx);

      if (rowPanes.length === 1) {
        rowNodes.push(this.createPaneNode(rowPanes[0]));
        continue;
      }

      rowNodes.push({
        type: 'split',
        direction: 'horizontal',
        sizes: Array(rowPanes.length).fill(1 / rowPanes.length),
        children: rowPanes.map((pane) => this.createPaneNode(pane)),
      });
    }

    if (rowNodes.length === 1) {
      return rowNodes[0];
    }

    return {
      type: 'split',
      direction: 'vertical',
      sizes: Array(rowNodes.length).fill(1 / rowNodes.length),
      children: rowNodes,
    };
  }

  private getScopeIdForWindowRequest(
    windowId: string,
    request: TmuxCommandRequest,
    explicitPaneId?: string,
  ): string | undefined {
    if (explicitPaneId) {
      return this.findPane(windowId, explicitPaneId)?.tmuxScopeId;
    }

    const requestTmuxPaneId = this.getRequestTmuxPaneId(request);
    if (!requestTmuxPaneId) {
      return undefined;
    }

    const resolved = this.resolvePaneTarget(requestTmuxPaneId, request);
    if (!resolved?.paneId || resolved.windowId !== windowId) {
      return undefined;
    }

    return this.findPane(windowId, resolved.paneId)?.tmuxScopeId;
  }

  private collapseTmuxScopesInWindow(window: Window): { changed: boolean; affectedPaneIds: string[] } {
    let nextLayout = window.layout;
    let nextActivePaneId = window.activePaneId;
    let changed = false;
    const affectedPaneIds = new Set<string>();

    const scopeIds = Array.from(new Set(
      this.getAllPanesFromLayout(window.layout)
        .map((pane) => pane.tmuxScopeId)
        .filter((scopeId): scopeId is string => Boolean(scopeId))
    ));

    for (const scopeId of scopeIds) {
      const match = this.findScopedLayoutMatch(nextLayout, (pane) => pane.tmuxScopeId === scopeId);
      if (!match) {
        continue;
      }

      match.panes.forEach((pane) => affectedPaneIds.add(pane.id));
      const paneToKeep = this.getPaneToKeepAfterTmuxTeardown(match.panes);
      const sanitizedPane = this.sanitizePaneForTmuxTeardown(paneToKeep);

      nextLayout = this.replaceLayoutNodeAtPath(nextLayout, match.path, {
        type: 'pane',
        id: sanitizedPane.id,
        pane: sanitizedPane,
      });

      if (match.panes.some((pane) => pane.id === nextActivePaneId)) {
        nextActivePaneId = sanitizedPane.id;
      }
      changed = true;
    }

    if (!changed) {
      const match = this.findScopedLayoutMatch(window.layout, (pane) => this.isTmuxAgentPane(pane));
      if (match) {
        const strongMarkerCount = match.panes.filter((pane) => this.hasStrongTmuxAgentMarker(pane)).length;
        const weakMarkerCount = match.panes.filter((pane) => this.hasWeakTmuxAgentMarker(pane)).length;
        if (strongMarkerCount > 0 || weakMarkerCount >= 2) {
          match.panes.forEach((pane) => affectedPaneIds.add(pane.id));
          const paneToKeep = this.getPaneToKeepAfterTmuxTeardown(match.panes);
          const sanitizedPane = this.sanitizePaneForTmuxTeardown(paneToKeep);
          nextLayout = this.replaceLayoutNodeAtPath(window.layout, match.path, {
            type: 'pane',
            id: sanitizedPane.id,
            pane: sanitizedPane,
          });
          if (match.panes.some((pane) => pane.id === nextActivePaneId)) {
            nextActivePaneId = sanitizedPane.id;
          }
          changed = true;
        }
      }
    }

    if (changed) {
      window.layout = nextLayout;
      window.activePaneId = nextActivePaneId || this.getAllPanesFromLayout(nextLayout)[0]?.id || '';
    }

    return {
      changed,
      affectedPaneIds: Array.from(affectedPaneIds),
    };
  }

  private adaptSendKeysForPane(keys: string, windowId: string, paneId: string, request?: TmuxCommandRequest): string {
    if (process.platform !== 'win32') {
      return keys;
    }

    const pane = this.findPane(windowId, paneId);
    const shellType = this.detectShellType(pane?.command);
    if (shellType === 'posix') {
      return keys;
    }

    const hasEnterSuffix = keys.endsWith('\r');
    const commandText = hasEnterSuffix ? keys.slice(0, -1) : keys;
    const injectedEnvAssignments = this.buildTeammateLaunchEnvAssignments(windowId, paneId, request);
    const translated = this.translateUnixEnvCommandForWindowsShell(commandText, shellType, injectedEnvAssignments);
    if (!translated) {
      return keys;
    }

    return hasEnterSuffix ? `${translated}\r` : translated;
  }

  private detectShellType(command?: string | null): 'powershell' | 'cmd' | 'posix' {
    const normalized = command?.toLowerCase() ?? '';
    if (
      normalized.includes('bash') ||
      normalized.includes('zsh') ||
      normalized === 'sh' ||
      normalized.endsWith('/sh') ||
      normalized.endsWith('\\sh.exe')
    ) {
      return 'posix';
    }

    if (normalized.includes('cmd.exe') || normalized === 'cmd') {
      return 'cmd';
    }

    return 'powershell';
  }

  private translateUnixEnvCommandForWindowsShell(
    commandText: string,
    shellType: 'powershell' | 'cmd' | 'posix',
    injectedEnvAssignments: Array<[string, string]> = []
  ): string | null {
    if (shellType === 'posix') {
      return null;
    }

    const match = commandText.match(/^cd\s+(.+?)\s*&&\s*env\s+(.+)$/s);
    if (!match) {
      return null;
    }

    const cwdTokens = this.tokenizeShellWords(`cd ${match[1]}`);
    if (cwdTokens.length < 2) {
      return null;
    }

    const tokens = this.tokenizeShellWords(match[2]);
    if (tokens.length === 0) {
      return null;
    }

    const envAssignments: Array<[string, string]> = [];
    let commandIndex = 0;
    for (; commandIndex < tokens.length; commandIndex += 1) {
      const token = tokens[commandIndex];
      const separatorIndex = token.indexOf('=');
      if (separatorIndex <= 0) {
        break;
      }

      const name = token.slice(0, separatorIndex);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        break;
      }

      envAssignments.push([name, token.slice(separatorIndex + 1)]);
    }

    if (envAssignments.length === 0 || commandIndex >= tokens.length) {
      return null;
    }

    const mergedAssignments = new Map(envAssignments);
    for (const [name, value] of injectedEnvAssignments) {
      mergedAssignments.set(name, value);
    }

    const cwd = cwdTokens.slice(1).join(' ');
    const executable = tokens[commandIndex];
    const args = tokens.slice(commandIndex + 1);

    return shellType === 'cmd'
      ? this.buildCmdLauncher(cwd, Array.from(mergedAssignments.entries()), executable, args)
      : this.buildPowerShellLauncher(cwd, Array.from(mergedAssignments.entries()), executable, args);
  }

  private buildTeammateLaunchEnvAssignments(
    windowId: string,
    paneId: string,
    request?: TmuxCommandRequest
  ): Array<[string, string]> {
    const tmuxPaneId = this.getTmuxPaneId(windowId, paneId);
    if (!tmuxPaneId) {
      return [];
    }

    const tmuxSocketPath = process.platform === 'win32'
      ? '\\.\pipe\ausome-tmux-default'
      : `/tmp/tmux-${process.getuid?.() ?? 1000}/default`;

    const assignments: Array<[string, string]> = [
      ['TMUX', `${tmuxSocketPath},${process.pid},0`],
      ['TMUX_PANE', tmuxPaneId],
      ['AUSOME_TERMINAL_WINDOW_ID', windowId],
      ['AUSOME_TERMINAL_PANE_ID', paneId],
      ['AUSOME_TMUX_RPC', this.getRpcSocketPath(windowId)],
      ['AUSOME_TMUX_LOG_FILE', this.getTmuxDebugLogFilePath()],
    ];

    if (this.isRequestDebugEnabled(request)) {
      assignments.push(['AUSOME_TMUX_DEBUG', '1']);
    }

    return assignments;
  }

  private tokenizeShellWords(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let escaped = false;

    for (const char of input) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\' && quote !== "'") {
        escaped = true;
        continue;
      }

      if (quote) {
        if (char === quote) {
          quote = null;
        } else {
          current += char;
        }
        continue;
      }

      if (char === "'" || char === '"') {
        quote = char as '"' | "'";
        continue;
      }

      if (/\s/.test(char)) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (escaped) {
      current += '\\';
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return tokens;
  }

  private prepareWindowsExecutable(
    executable: string,
    args: string[]
  ): { executable: string; args: string[] } {
    if (process.platform !== 'win32') {
      return { executable, args };
    }

    const normalized = executable.toLowerCase();
    if (normalized.endsWith('.js') || normalized.endsWith('.cjs') || normalized.endsWith('.mjs')) {
      return {
        executable: 'node',
        args: [executable, ...args],
      };
    }

    return { executable, args };
  }

  private buildPowerShellLauncher(
    cwd: string,
    envAssignments: Array<[string, string]>,
    executable: string,
    args: string[]
  ): string {
    const prepared = this.prepareWindowsExecutable(executable, args);
    const parts = [`Set-Location -LiteralPath ${this.quotePowerShell(cwd)}`];
    for (const [name, value] of envAssignments) {
      parts.push(`$env:${name} = ${this.quotePowerShell(value)}`);
    }

    const invocation = [`& ${this.quotePowerShell(prepared.executable)}`, ...prepared.args.map(arg => this.quotePowerShell(arg))].join(' ');
    parts.push(invocation);
    return parts.join('; ');
  }

  private buildCmdLauncher(
    cwd: string,
    envAssignments: Array<[string, string]>,
    executable: string,
    args: string[]
  ): string {
    const prepared = this.prepareWindowsExecutable(executable, args);
    const parts = [`cd /d ${this.quoteCmd(cwd)}`];
    for (const [name, value] of envAssignments) {
      parts.push(`set ${this.quoteCmd(`${name}=${value}`)}`);
    }

    parts.push([this.quoteCmd(prepared.executable), ...prepared.args.map(arg => this.quoteCmd(arg))].join(' '));
    return parts.join(' && ');
  }

  private quotePowerShell(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private quoteCmd(value: string): string {
    const escaped = value.replace(/"/g, '""');
    return /[\s&()\[\]{}^=;!'+,`~]/.test(escaped) ? `"${escaped}"` : escaped;
  }
  private isRequestDebugEnabled(request?: TmuxCommandRequest): boolean {
    return this.config.debug || request?.debug === true;
  }

  private debugLog(request: TmuxCommandRequest | undefined, message: string, extra?: unknown): void {
    this.appendTmuxDebugFile(request, message, extra);

    if (!this.isRequestDebugEnabled(request)) {
      return;
    }

    if (extra === undefined) {
      console.log(`[TmuxCompatService] ${message}`);
      return;
    }

    console.log(`[TmuxCompatService] ${message}`, extra);
  }

  private getTmuxDebugLogFilePath(): string {
    return path.join(os.tmpdir(), 'copilot-terminal-tmux-debug.log');
  }

  private appendTmuxDebugFile(request: TmuxCommandRequest | undefined, message: string, extra?: unknown): void {
    const logFile = request?.debugContext?.logFile ?? this.getTmuxDebugLogFilePath();
    const payload = extra === undefined
      ? ''
      : ` ${JSON.stringify(extra, (_key, value) => value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value)}`;

    try {
      fs.appendFileSync(logFile, `[TmuxCompatService ${new Date().toISOString()}] ${message}${payload}\n`, 'utf8');
    } catch {
      // ignore file logging failures
    }
  }

  private summarizeResponse(response: TmuxCommandResponse): Record<string, unknown> {
    return {
      exitCode: response.exitCode,
      stdoutLength: response.stdout.length,
      stderrLength: response.stderr.length,
      stdoutPreview: response.stdout.slice(0, 200),
      stderrPreview: response.stderr.slice(0, 200),
    };
  }

  private getRequestTmuxPaneId(request?: TmuxCommandRequest): TmuxPaneId | undefined {
    if (request?.paneId) {
      return request.paneId;
    }

    const windowId = request?.windowId ?? request?.debugContext?.windowId;
    const workspacePaneId = request?.debugContext?.paneId;
    if (!windowId || !workspacePaneId) {
      return undefined;
    }

    return this.getTmuxPaneId(windowId, workspacePaneId);
  }

  private resolvePaneTarget(
    tmuxPaneId: TmuxPaneId,
    request?: TmuxCommandRequest,
  ): { windowId: string; paneId?: string } | null {
    const resolved = this.resolvePaneId(tmuxPaneId);
    if (resolved) {
      return resolved;
    }

    const requestTmuxPaneId = this.getRequestTmuxPaneId(request);
    const windowId = request?.windowId ?? request?.debugContext?.windowId;
    const workspacePaneId = request?.debugContext?.paneId;
    if (!windowId || requestTmuxPaneId !== tmuxPaneId) {
      return null;
    }

    if (workspacePaneId && this.findPane(windowId, workspacePaneId)) {
      this.registerPane(tmuxPaneId, windowId, workspacePaneId);
      this.debugLog(request, 'recovered pane target mapping from request context', {
        tmuxPaneId,
        windowId,
        paneId: workspacePaneId,
      });
      return { windowId, paneId: workspacePaneId };
    }

    this.debugLog(request, 'recovered pane target window from request context', {
      tmuxPaneId,
      windowId,
      paneId: workspacePaneId,
    });
    return { windowId, paneId: workspacePaneId };
  }

  private formatField(field: string, context: {
    tmuxPaneId?: TmuxPaneId;
    windowId?: string;
    paneId?: string;
    namespace?: string;
  }): string {
    const tmuxWindowContext = this.getTmuxWindowContext(context.windowId, context.namespace);

    switch (field) {
      case 'pane_id':
        return context.tmuxPaneId || '';

      case 'session_name':
        return tmuxWindowContext.sessionName;

      case 'window_id':
        return tmuxWindowContext.tmuxWindowId;

      case 'window_index':
        return String(tmuxWindowContext.windowIndex);

      case 'window_name':
        return tmuxWindowContext.windowName;

      case 'pane_title':
        if (context.tmuxPaneId) {
          const metadata = this.paneMetadata.get(context.tmuxPaneId);
          return metadata?.title || '';
        }
        return '';

      default:
        return '';
    }
  }

  /**
   * 闂傚倸鍊风粈渚€骞栭銈囩煋闁割偅娲栭崒銊ф喐韫囨拹锝夊箛閻楀牊娅㈤梺缁橆焾鐏忔瑩藝?format 闂傚倷娴囬褏鈧稈鏅濈划娆撳箳濡炲皷鍋撻崘顔奸唶闁靛鍠楅弲鐐寸箾鏉堝墽鍒版繝鈧柆宥呯厺?   */
  private formatString(format: string, context: {
    tmuxPaneId?: TmuxPaneId;
    windowId?: string;
    paneId?: string;
    namespace?: string;
  }): string {
    const fields = TmuxCommandParser.parseFormatString(format);
    let result = format;

    for (const field of fields) {
      const value = this.formatField(field, context);
      result = result.replace(`#{${field}}`, value);
    }

    return result;
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?tmux -V
   */
  private handleVersion(): TmuxCommandResponse {
    return {
      exitCode: 0,
      stdout: 'tmux 3.4\n',
      stderr: '',
    };
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?display-message
   */
  private handleDisplayMessage(parsed: any, request: TmuxCommandRequest): TmuxCommandResponse {
    try {
      const options = TmuxCommandParser.parseDisplayMessageOptions(parsed);
      const namespace = this.getNamespace(parsed, request);
      this.debugLog(request, 'display-message request', {
        target: options.target,
        format: options.format,
        namespace,
        requestWindowId: request.windowId,
        requestPaneId: request.paneId,
        resolvedRequestTmuxPaneId: this.getRequestTmuxPaneId(request),
        debugContext: request.debugContext,
      });

      // 缂傚倸鍊烽懗鍫曟惞鎼淬劌鐭楅幖娣妼缁愭鏌″搴″箺闁稿鏅涜灃闁挎繂鎳庨弳鐐烘煕鎼粹€愁劉闁靛洤瀚板顕€宕掑☉娆戝涧闂?pane

      let tmuxPaneId: TmuxPaneId | undefined;
      let windowId: string | undefined;
      let paneId: string | undefined;

      if (options.target) {
        const targetInfo = TmuxCommandParser.parseTarget(options.target);
        if (targetInfo.type === 'pane' && targetInfo.paneId) {
          tmuxPaneId = targetInfo.paneId;
          const resolved = this.resolvePaneTarget(tmuxPaneId, request);
          if (resolved) {
            windowId = resolved.windowId;
            paneId = resolved.paneId;
          }
        }
      } else {
        // 濠电姷鏁搁崑鐘诲箵椤忓棛绀婇柍褜鍓氱换娑欏緞鐎ｎ偆顦伴悗娈垮櫘閸嬪﹥淇婇崼鏇炵倞闁靛鍎宠ぐ鎾⒒閸屾瑧顦﹂柣蹇旂箞椤㈡牠宕惰閼板潡鏌℃径瀣亶婵℃彃鐗撻弻鐔煎垂椤斿吋娈Δ鐘靛仦钃辩紒缁樼洴瀹曞ジ鎮㈡搴濈礃闂備線娼уú锕傚礉濞嗘挾宓佹慨妞诲亾鐎规洘锚椤斿繘顢欓悾灞稿亾?pane
        tmuxPaneId = this.getRequestTmuxPaneId(request);
        windowId = request.windowId;
        if (windowId) {
          this.ensureWorkspaceWindowMapped(windowId, namespace);
        }
        if (tmuxPaneId) {
          const resolved = this.resolvePaneTarget(tmuxPaneId, request);
          if (resolved) {
            paneId = resolved.paneId;
          }
        }
      }

      if (!tmuxPaneId || !windowId) {
        this.debugLog(request, 'display-message failed to resolve pane/window', {
          target: options.target,
          namespace,
          tmuxPaneId,
          windowId,
          requestWindowId: request.windowId,
          requestPaneId: request.paneId,
          debugContext: request.debugContext,
        });
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: can\'t find pane\n',
        };
      }

      // 闂傚倸鍊风粈渚€骞栭銈囩煋闁割偅娲栭崒銊ф喐韫囨拹锝夊箛閻楀牊娅㈤梺缁橆焾鐏忔瑩藝闁秵鈷戦柛婵嗗閳诲鏌涢幘瀵搞€掔紒杈ㄧ懄缁绘繂顫濋鐘插箞?

      let output = '';
      if (options.format) {
        output = this.formatString(options.format, { tmuxPaneId, windowId, paneId, namespace });
      } else {
        // 濠电姵顔栭崰妤冩暜濡ゅ啰鐭欓柟鐑樸仜閳ь剨绠撳畷濂稿Ψ椤旇姤娅嶇紓鍌氬€烽悞锕佹懌缂傚倸绉村ú顓㈠蓟閻旂厧绠氱憸宥夊汲鏉堛劍鍙?pane ID
        output = tmuxPaneId;
      }

      return {
        exitCode: 0,
        stdout: output + '\n',
        stderr: '',
      };
    } catch (error: unknown) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?list-panes
   */
  private handleListPanes(parsed: any, request: TmuxCommandRequest): TmuxCommandResponse {
    try {
      const options = TmuxCommandParser.parseListPanesOptions(parsed);
      const namespace = this.getNamespace(parsed, request);

      // 缂傚倸鍊烽懗鍫曟惞鎼淬劌鐭楅幖娣妼缁愭鏌″搴″箺闁稿鏅涜灃闁挎繂鎳庨弳鐐烘煕鎼粹€愁劉闁靛洤瀚板顕€宕掑☉娆戝涧闂?window

      let windowId: string | undefined;

      if (options.target) {
        const targetInfo = TmuxCommandParser.parseTarget(options.target);
        if (targetInfo.type === 'window') {
          // 闂傚倷娴囧畷鐢稿窗閹扮増鍋￠弶鍫氭櫅缁躲倕螖閿濆懎鏆為柛?window target
          windowId = this.resolveWindowTarget(options.target, namespace) ?? undefined;
          if (!windowId && request.windowId && targetInfo.sessionName) {
            this.ensureWorkspaceWindowMapped(request.windowId, namespace, targetInfo.sessionName);
            windowId = this.resolveWindowTarget(options.target, namespace) ?? undefined;
          }
        } else if (targetInfo.type === 'pane' && targetInfo.paneId) {
          // 濠?pane 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞?window
          const resolved = this.resolvePaneTarget(targetInfo.paneId, request);
          if (resolved) {
            windowId = resolved.windowId;
          }
        }
      } else {
        // 濠电姷鏁搁崑鐘诲箵椤忓棛绀婇柍褜鍓氱换娑欏緞鐎ｎ偆顦伴悗娈垮櫘閸嬪﹥淇婇崼鏇炵倞闁靛鍎宠ぐ鎾⒒閸屾瑧顦﹂柣蹇旂箞椤㈡牠宕惰閼板潡鏌℃径瀣亶婵℃彃鐗撻弻鐔煎垂椤斿吋娈Δ鐘靛仦钃辩紒缁樼洴瀹曞ジ鎮㈡搴濈礃闂備線娼уú锕傚礉濞嗘挾宓佹慨妞诲亾鐎规洘锚椤斿繘顢欓悾灞稿亾?window
        windowId = request.windowId;
        if (windowId) {
          this.ensureWorkspaceWindowMapped(windowId, namespace);
        }
      }

      if (!windowId) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: can\'t find window\n',
        };
      }

      // 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞?window 闂傚倸鍊烽悞锕傛儑瑜版帒绀夌€光偓閳ь剟鍩€椤掍礁鍤柛妯圭矙瀵尙鎹勬笟顖氭倯婵犮垼娉涢敃銈夋偟?panes

      const panes = this.getAllTerminalPanes(windowId);
      const output: string[] = [];

      for (const pane of panes) {
        // 闂傚倸鍊风粈渚€骞栭銈嗗仏妞ゆ劧绠戠壕鍧楁煕濞嗗浚妲洪柣?tmux pane ID
        const reverseKey = `${windowId}:${pane.id}`;
        const tmuxPaneId = this.reversePaneIdMap.get(reverseKey);

        if (tmuxPaneId) {
          if (options.format) {
            const formatted = this.formatString(options.format, {
              tmuxPaneId,
              windowId,
              paneId: pane.id,
              namespace,
            });
            output.push(formatted);
          } else {
            output.push(tmuxPaneId);
          }
        }
      }

      return {
        exitCode: 0,
        stdout: output.join('\n') + (output.length > 0 ? '\n' : ''),
        stderr: '',
      };
    } catch (error: unknown) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?split-window
   */
  private async handleSplitWindow(parsed: any, request: TmuxCommandRequest): Promise<TmuxCommandResponse> {
    try {
      const options = TmuxCommandParser.parseSplitWindowOptions(parsed);
      const namespace = this.getNamespace(parsed, request);

      // 缂傚倸鍊烽懗鍫曟惞鎼淬劌鐭楅幖娣妼缁愭鏌″搴″箺闁稿鏅涜灃闁挎繂鎳庨弳鐐烘煕鎼粹€愁劉闁靛洤瀚板顕€宕掑☉娆戝涧闂?pane/window

      let windowId: string | undefined;
      let targetPaneId: string | undefined;

      if (options.target) {
        const targetInfo = TmuxCommandParser.parseTarget(options.target);
        if (targetInfo.type === 'pane' && targetInfo.paneId) {
          const resolved = this.resolvePaneTarget(targetInfo.paneId, request);
          if (resolved) {
            windowId = resolved.windowId;
            targetPaneId = resolved.paneId;
          }
        } else if (targetInfo.type === 'window') {
          windowId = this.resolveWindowTarget(options.target, namespace) ?? undefined;
          if (!windowId && request.windowId && targetInfo.sessionName) {
            this.ensureWorkspaceWindowMapped(request.windowId, namespace, targetInfo.sessionName);
            windowId = this.resolveWindowTarget(options.target, namespace) ?? undefined;
          }
        }
      } else {
        windowId = request.windowId;
        const requestTmuxPaneId = this.getRequestTmuxPaneId(request);
        if (requestTmuxPaneId) {
          const resolved = this.resolvePaneTarget(requestTmuxPaneId, request);
          if (resolved) {
            targetPaneId = resolved.paneId;
          }
        }
      }

      if (windowId) {
        this.ensureWorkspaceWindowMapped(windowId, namespace);
      }

      if (!windowId) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: can\'t find window\n',
        };
      }

      // 闂傚倸鍊风粈渚€骞夐敍鍕殰婵°倕鍟伴惌娆撴煙鐎电啸缁惧彞绮欓弻鐔煎箲閹伴潧娈┑?pane

      const newPaneId = randomUUID();
      const newTmuxPaneId = this.allocatePaneId();
      const targetWindow = this.getWindowById(windowId);
      const fallbackPane = targetWindow
        ? this.getAllPanesFromLayout(targetWindow.layout).find((pane) => isTerminalPane(pane)) ?? null
        : null;
      const sourcePane = targetPaneId ? this.findPane(windowId, targetPaneId) : fallbackPane;
      if (sourcePane && !isTerminalPane(sourcePane)) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: can\'t find pane\n',
        };
      }
      const paneCwd = sourcePane?.cwd || request.cwd || process.cwd();
      const paneCommand = sourcePane?.command || 'shell';
      const tmuxScopeId = sourcePane?.tmuxScopeId || randomUUID();

      // 缂傚倸鍊烽懗鍫曟惞鎼淬劌鐭楅幖娣妼缁愭鏌″搴″箺闁稿鏅涜灃闁挎繂鎳庨弳娆戠磼閳ь剟宕卞☉娆戝幈闂佹枼鏅涢崰姘枔閺冣偓閵囧嫰濡烽妷褏顔掗梺鍝勭焿缁绘繂鐣烽幒鎴叆闁告洦鍋呴悾顒勬⒒?

      const direction = options.horizontal ? 'horizontal' : 'vertical';

      // 闂傚倷娴囧畷鍨叏瀹曞洦顐介柕鍫濇处椤洟鏌￠崶銉ョ仾闁稿鏅濈槐鎾存媴婵埈浜炲▎銏ゆ倷閸偄鏋戦悗骞垮劚椤︿即宕曞鍡愪簻闁瑰搫妫楁禍楣冩偠濮橆厾鎳囬柡宀嬬節瀹曟帒顫濋鑺ュ瘱濠?

      let sizeRatio = 0.5; // 濠电姵顔栭崰妤冩暜濡ゅ啰鐭欓柟鐑樸仜閳ь剨绠撳畷濂稿Ψ椤旇姤娅?50/50
      if (options.percentage) {
        sizeRatio = options.percentage / 100;
      }

      // 闂傚倸鍊风粈渚€骞栭鈷氭椽濡舵径瀣槐闂侀潧艌閺呮盯鎷?layout 闂?

      this.config.updateWindowStore((state: any) => {
        const window = state.windows.find((w: Window) => w.id === windowId);
        if (!window) {
          throw new Error('Window not found');
        }

        // 闂傚倸鍊风粈渚€骞夐敍鍕殰婵°倕鍟伴惌娆撴煙鐎电啸缁惧彞绮欓弻鐔煎箲閹伴潧娈┑?pane 闂傚倷娴囬褍霉閻戣棄鏋侀柟闂撮檷閳ь兛鐒︾换婵嬪炊閵娿儳妯?

        const newPane: Pane = {
          id: newPaneId,
          cwd: paneCwd,
          command: paneCommand,
          status: WindowStatus.Paused,
          pid: null,
          tmuxScopeId,
        };

        if (sourcePane?.id && !sourcePane.tmuxScopeId) {
          this.assignPaneScopeInLayout(window.layout, sourcePane.id, tmuxScopeId);
        }

        // 闂傚倸鍊风粈浣革耿鏉堚晛鍨濇い鏍ㄧ矋閺嗘粓鏌熼悜姗嗘當闁活厽顨婇弻娑㈠焺閸愵亖妲堝┑?pane 闂?layout 闂?

        if (targetPaneId) {
          if (window.layout.type === 'pane' && window.layout.id === targetPaneId) {
            window.layout = {
              type: 'split',
              direction,
              sizes: [1 - sizeRatio, sizeRatio],
              children: [
                window.layout,
                { type: 'pane', id: newPaneId, pane: newPane },
              ],
            };
          } else {
            // 闂傚倸鍊风欢姘焽閼姐倖瀚婚柣鏃傚帶缁€澶愬箹缁懓鐓戦柣鎴灻閬嶆煛婢跺鐏ラ柛?pane 闂傚倸鍊风粈渚€骞栭锕€鐤柍杞版€ヨぐ鎺戠倞闁冲搫鍟畷銉╂⒑缂佹ɑ鈷掗柛妯犲懐鐭嗛柛鈩冪⊕閻撴洟鏌嶉埡浣告灓婵炲牊姊归妵?
            this.splitPaneInLayout(window.layout, targetPaneId, newPane, direction, sizeRatio);
          }
        } else {
          // 闂傚倸鍊风欢姘焽閼姐倖瀚婚柣鏃傚帶缁€澶屸偓骞垮劚椤︿即宕戠€ｎ喗鐓欑紓浣靛灩閺嬬喖鏌涢妶鍛ч柡灞剧〒娴狅箓宕滆閻撯偓濠电偛顕刊顓㈠垂閸洖钃熸繛鎴欏灩缁犳娊鏌熺€电鍓辨俊顐ゅ仦缁?
          const oldRoot = window.layout;
          window.layout = {
            type: 'split',
            direction,
            sizes: [1 - sizeRatio, sizeRatio],
            children: [
              oldRoot,
              { type: 'pane', id: newPaneId, pane: newPane },
            ],
          };
        }
      });

      // 婵犵數濮烽弫鎼佸磻濞戔懞鍥敇閵忕姷顦悗鍏夊亾闁告洦鍋夐崺?pane 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂?

      this.registerPane(newTmuxPaneId, windowId, newPaneId);

      try {
        await this.spawnPaneShell(windowId, newPaneId, paneCwd, options.command || paneCommand);
      } catch (error: unknown) {
        console.error('[TmuxCompatService] Failed to spawn terminal:', error);
      }

      this.emitWindowSynced(windowId);

      // 闂傚倷绀侀幖顐λ囬锕€鐤炬繝濠傜墕閽冪喖鏌曟繛鍨壄婵炲樊浜滈崘鈧銈嗘尵閸嬬偤藟?pane ID

      if (options.print && options.format) {
        const output = this.formatString(options.format, {
          tmuxPaneId: newTmuxPaneId,
          windowId,
          paneId: newPaneId,
          namespace,
        });
        return {
          exitCode: 0,
          stdout: output + '\n',
          stderr: '',
        };
      } else if (options.print) {
        return {
          exitCode: 0,
          stdout: newTmuxPaneId + '\n',
          stderr: '',
        };
      } else {
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };
      }
    } catch (error: unknown) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  /**
   * 闂?layout 闂傚倸鍊风粈渚€骞栭銈囩煋闁汇垻顭堥崹鍌炴煙閹澘袚闁搞倕鐗撻弻鐔告綇閸撗呮殸缂備讲鍋撻柛鈩冪⊕閻撴洟鏌嶉埡浣告灓婵炲牊姊归妵?pane
   */
  private splitPaneInLayout(
    node: LayoutNode,
    targetPaneId: string,
    newPane: Pane,
    direction: 'horizontal' | 'vertical',
    sizeRatio: number
  ): boolean {
    if (node.type === 'pane') {
      if (node.id === targetPaneId) {
        // 闂傚倸鍊烽懗鍫曞箠閹剧粯鍊舵慨妯挎硾绾惧潡鏌熼幆鐗堫棄闁哄嫨鍎抽埀顒€鍘滈崑鎾绘煕閺囥劌澧柛鎿冨枛椤啴濡堕崱妯锋嫽闂佸搫鎷嬮崑濠傜暦?pane闂傚倸鍊烽悞锔锯偓绗涘懐鐭欓柟瀵稿仧闂勫嫰鏌￠崘銊モ偓鍝ユ閵堝憘鏃堟晲閸涱厽娈紓渚囧亜缁夊綊寮婚敐鍛傜喖鎼归惂鍝ョ闂備線娼уΛ妤呮晝椤忓牆钃熸繛鎴欏灪閺呮粓鏌涘┑鍡楊仼妞ゎ剙鐗撻幃宄邦煥閸曨剛鍑℃繝鈷€鍌滅煓闁糕斁鍋撳銈嗗笂閼冲爼鍩婇弴銏＄厱闁哄啠鍋撻拑鍗炃庨崶褝韬い銏★耿婵偓闁炽儲鏋奸崑鎾绘倻閼恒儮鎷哄銈嗗姧缁插潡濡撮幒妤佺厽闁绘梻顭堟慨宥夋煛鐏炲墽娲存鐐村浮楠炲鎮滈崱姗嗘＇婵?        // 闂傚倸鍊搁崐鎼佸磹缁嬫５娲偐鐠囪尙锛涢梺鐟板⒔缁垶宕戦敓鐘崇厸闁搞儯鍔嶉惃鎴炪亜閿斿ジ妾紒缁樼箞閸┾偓妞ゆ帒瀚烽弫鍌炴煕椤愩倕鏋庡ù婊庡灦濮婅櫣鎷犻垾宕囦画濠电姰鍨洪…鍫ユ倶閹扮増鈷掑ù锝堟鐢盯鏌涢弮鈧〃濠囩嵁婵犲洤绠婚柛鎴炴緲濞差參宕洪敓鐘插窛妞ゆ棃妫块崫?
        return true;
      }
      return false;
    }

    // 闂傚倸鍊风欢姘焽閼姐倖瀚婚柣鏃傚帶缁€澶屸偓鍏夊亾闁告洦鍓欐禒鍗炩攽閻愬弶顥為柟绋款煼瀹曢潧顓兼径瀣幈闁诲繒鍋涙晶浠嬫儗婵犲伅褰掓偑閳ь剟宕规导鏉戠叀濠㈣埖鍔曠粻濂告煕閹扳晛濡肩紒鐘虫そ濮婅櫣绱掑Ο缁樺創缂備胶绮换鍫ユ偘?

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];

      if (child.type === 'pane' && child.id === targetPaneId) {
        // 闂傚倸鍊烽懗鍫曞箠閹剧粯鍊舵慨妯挎硾绾惧潡鏌熼幆鐗堫棄闁哄嫨鍎抽埀顒€鍘滈崑鎾绘煕閺囥劌澧柛鎿冨枛椤啴濡堕崱妯锋嫽闂佸搫鎷嬮崑濠傜暦?pane闂傚倸鍊烽悞锔锯偓绗涘懐鐭欓柟杈剧畱鐎氬銇勯幒鍡椾壕闂傚洤顦扮换娑㈠箣濞嗗繒浠肩紓浣哄Т瀵爼濡甸崟顖ｆ晝妞ゆ劑鍨圭紒鈺冪磽娴ｆ彃浜?split 闂傚倸鍊烽懗鍫曞储瑜旈獮鏍敃閿曗偓绾剧懓鈹戦悩瀹犲缁?
        const newSplit: LayoutNode = {
          type: 'split',
          direction,
          sizes: [1 - sizeRatio, sizeRatio],
          children: [
            child,
            { type: 'pane', id: newPane.id, pane: newPane },
          ],
        };

        node.children[i] = newSplit;

        // 闂傚倸鍊搁崐鐑芥倿閿曚降浜归柛鎰典簽閻捇鏌ｉ姀銏╃劸闁藉啰鍠庨埞鎴︽偐閹绘帩浠炬繝娈垮灠閵堟悂寮婚妸銉㈡婵☆垯璀︽导鈧梻?sizes
        // 濠电姷鏁搁崕鎴犲緤閽樺娲晜閻愵剙搴婇梺鍛婂姦娴滄牠宕戦幘璇插瀭妞ゆ劧缍嗗鍧楁⒑闂堟稒澶勯柛鏃€鐟╅悰顔碱潨閳ь剙鐣峰Ο渚晠妞ゆ梻鏅埀顒夊亰濮婅櫣鎷犻幓鎺濆妷缂備礁顑嗙敮鈥崇暦濠靛柈鐔烘媼瀹曞洨鐣炬俊鐐€栭幐鍫曞垂濞差亜纾归柣鎴ｅГ閻撴洟鏌ㄩ弮鍥跺殭妤犵偞顨婇弻锝夋晲閸涱叀鍩炲銈庡幖濞尖€崇暦婵傜骞㈡俊銈傚亾闁哄棛鍠愰幈銊╂晲閸涱垰顣洪梺瀹犳椤︾敻鐛Ο铏规殾闁搞儱妫庨崹濠氬箟?
        return true;
      }

      if (child.type === 'split') {
        if (this.splitPaneInLayout(child, targetPaneId, newPane, direction, sizeRatio)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?select-layout
   */
  private handleSelectLayout(parsed: any, request: TmuxCommandRequest): TmuxCommandResponse {
    try {
      const options = TmuxCommandParser.parseSelectLayoutOptions(parsed);
      const namespace = this.getNamespace(parsed, request);

      // 缂傚倸鍊烽懗鍫曟惞鎼淬劌鐭楅幖娣妼缁愭鏌″搴″箺闁稿鏅涜灃闁挎繂鎳庨弳鐐烘煕鎼粹€愁劉闁靛洤瀚板顕€宕掑☉娆戝涧闂?window

      let windowId: string | undefined;
      let targetPaneId: string | undefined;

      if (options.target) {
        const targetInfo = TmuxCommandParser.parseTarget(options.target);
        if (targetInfo.type === 'window') {
          windowId = this.resolveWindowTarget(options.target, namespace) ?? undefined;
          if (!windowId && request.windowId && targetInfo.sessionName) {
            this.ensureWorkspaceWindowMapped(request.windowId, namespace, targetInfo.sessionName);
            windowId = this.resolveWindowTarget(options.target, namespace) ?? undefined;
          }
        } else if (targetInfo.type === 'pane' && targetInfo.paneId) {
          const resolved = this.resolvePaneTarget(targetInfo.paneId, request);
          if (resolved) {
            windowId = resolved.windowId;
            targetPaneId = resolved.paneId;
          }
        }
      } else {
        windowId = request.windowId;
      }

      if (!windowId) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: can\'t find window\n',
        };
      }

      // 闂傚倷绀佸﹢閬嶅储瑜旈幃娲Ω閵夘喗缍庢繝鐢靛У閼归箖寮告笟鈧弻鏇㈠醇濠靛洤顦╅梺鍝勬缁捇寮诲☉銏犵疀闁宠桨绀侀‖瀣攽閻橆偄浜?

      const scopeId = this.getScopeIdForWindowRequest(windowId, request, targetPaneId);

      if (options.layout === 'main-vertical') {
        this.applyMainVerticalLayout(windowId, scopeId);
      } else if (options.layout === 'tiled') {
        this.applyTiledLayout(windowId, scopeId);
      }

      this.emitWindowSynced(windowId);

      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    } catch (error: unknown) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  /**
   * 闂傚倷绀佸﹢閬嶅储瑜旈幃娲Ω閵夘喗缍庢繝鐢靛У閼归箖寮?main-vertical 闂傚倷鐒﹂惇褰掑春閸曨垰鍨傚ù鍏兼綑閻ゎ喗銇勯幇鍫曟闁稿孩鍨堕妵鍕箳閹存繍浠鹃梺鍝勬媼閸撶喖寮诲☉銏╂晝闁挎繂娲ㄩ悾杈╃磽?30% leader闂傚倸鍊烽悞锔锯偓绗涘懐鐭欓柟杈鹃檮閸ゆ劖銇勯弽銊х細濞?70% teammates闂?   */
  private applyMainVerticalLayout(windowId: string, scopeId?: string): void {
    this.config.updateWindowStore((state: any) => {
      const window = state.windows.find((w: Window) => w.id === windowId);
      if (!window) {
        throw new Error('Window not found');
      }

      const scopedMatch = scopeId
        ? this.findScopedLayoutMatch(window.layout, (pane) => pane.tmuxScopeId === scopeId)
        : null;
      const panes = scopedMatch
        ? scopedMatch.panes
        : this.getAllPanesFromLayout(window.layout).filter((pane) => isTerminalPane(pane));
      if (panes.length === 0) {
        return;
      }

      const nextLayout = this.buildMainVerticalLayout(panes);
      window.layout = scopedMatch
        ? this.replaceLayoutNodeAtPath(window.layout, scopedMatch.path, nextLayout)
        : nextLayout;
    });
  }

  /**
   * 闂傚倷绀佸﹢閬嶅储瑜旈幃娲Ω閵夘喗缍庢繝鐢靛У閼归箖寮?tiled 闂傚倷鐒﹂惇褰掑春閸曨垰鍨傚ù鍏兼綑閻ゎ喗銇勯幇鍫曟闁稿孩鍨堕妵鍕箳閹存繍浠鹃梺鍝勬媼閸撶喖寮诲☉銏╂晝闁挎繂娲ㄩ悿鍕⒑閻熸澘顥忛柛鎾跺枎椤繐煤椤忓嫮顦悷婊冪Ч瀹曟繄鈧綆浜堕悢鍡欐喐瀹ュ洨鐭撻柣鐔煎亰閸?panes闂?   */
  private applyTiledLayout(windowId: string, scopeId?: string): void {
    this.config.updateWindowStore((state: any) => {
      const window = state.windows.find((w: Window) => w.id === windowId);
      if (!window) {
        throw new Error('Window not found');
      }

      const scopedMatch = scopeId
        ? this.findScopedLayoutMatch(window.layout, (pane) => pane.tmuxScopeId === scopeId)
        : null;
      const panes = scopedMatch
        ? scopedMatch.panes
        : this.getAllPanesFromLayout(window.layout).filter((pane) => isTerminalPane(pane));
      if (panes.length === 0) {
        return;
      }

      const nextLayout = this.buildTiledLayout(panes);
      window.layout = scopedMatch
        ? this.replaceLayoutNodeAtPath(window.layout, scopedMatch.path, nextLayout)
        : nextLayout;
    });
  }

  /**
   * 濠?layout 闂傚倸鍊风粈渚€骞栭銈囩煋闁汇垻顭堥崹鍌炴煙閹澘袚闁搞倕鐗撻弻鐔告綇閸撗呮殸缂備胶濮烽弫濠氬蓟閻斿吋鐒介柨鏇楀亾濠⒀屽枤缁辨帡骞撻幒鎾充淮闂佸搫鐬奸崰鎾诲窗婵犲伣鐔告姜閺夋妫滈梻?panes
   */
  private getAllPanesFromLayout(node: LayoutNode): Pane[] {
    if (node.type === 'pane') {
      return [node.pane];
    }

    const panes: Pane[] = [];
    for (const child of node.children) {
      panes.push(...this.getAllPanesFromLayout(child));
    }
    return panes;
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?resize-pane
   */
  private handleResizePane(parsed: any, request: TmuxCommandRequest): TmuxCommandResponse {
    try {
      const options = TmuxCommandParser.parseResizePaneOptions(parsed);

      // 闂傚倷娴囧畷鐢稿窗閹扮増鍋￠弶鍫氭櫅缁躲倕螖閿濆懎鏆為柛濠囨涧闇夐柣妯烘▕閸庢劙鏌涙惔鈥愁劉闁靛洤瀚板顕€宕掑☉娆戝涧闂?pane

      const targetInfo = TmuxCommandParser.parseTarget(options.target);
      if (targetInfo.type !== 'pane' || !targetInfo.paneId) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: invalid target\n',
        };
      }

      const resolved = this.resolvePaneTarget(targetInfo.paneId, request);
      if (!resolved?.paneId) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: can\'t find pane\n',
        };
      }

      const resolvedPaneId = resolved.paneId;

      // 闂傚倷娴囧畷鍨叏瀹曞洦顐介柕鍫濇处椤洟鏌￠崶銉ョ仾闁稿鏅涢埞鎴︽偐鐎圭姴顥濆┑鈽嗗亝閿曘垽寮婚埄鍐ㄧ窞閹兼惌鍨堕悰婊勭箾鐎涙鐜荤紓宥勭窔楠?

      let widthRatio: number | undefined;
      let heightRatio: number | undefined;

      if (options.percentage) {
        widthRatio = options.percentage / 100;
      }

      // 闂傚倸鍊风粈渚€骞栭鈷氭椽濡舵径瀣槐闂侀潧艌閺呮盯鎷?layout 闂傚倸鍊风粈渚€骞栭銈囩煋闁汇垻顭堥崹鍌炴煙閹澘袚闁搞倕鐗撻弻鐔告綇妤ｅ啯顎嶉梺?sizes

      this.config.updateWindowStore((state: any) => {
        const window = state.windows.find((w: Window) => w.id === resolved.windowId);
        if (!window) {
          throw new Error('Window not found');
        }

        // 闂?layout 闂傚倸鍊风粈渚€骞栭銈囩煋闁汇垻顭堥崹鍌炴煙閹澘袚闁搞倕鐗撻弻鐔告綇閸撗呮殸闂佽棄鍟伴崰鏍蓟閺囩喎绶炴繛鎴炴皑閺嗙姴顪冮妶鍐ㄥ姕缂佽鍟撮妴鍐Ψ閳哄倸鈧兘鏌℃径瀣仴濠殿喗鎮傚鍝勑ч崶褍顬嬮梺鍝ュУ閻楁洟顢?pane 濠电姷鏁告慨浼村垂瑜版帗鍋夐柕蹇嬪€曠粈鍐┿亜韫囨挻鍣芥俊?

        this.resizePaneInLayout(window.layout, resolvedPaneId, widthRatio, heightRatio);
      });

      this.emitWindowSynced(resolved.windowId);

      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    } catch (error: unknown) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  /**
   * 闂?layout 闂傚倸鍊风粈渚€骞栭銈囩煋闁汇垻顭堥崹鍌炴煙閹澘袚闁搞倕鐗撻弻鐔衡偓鐢殿焾鏍￠柣搴㈠嚬閸撶喖寮诲☉銏犵疀闁靛闄勯悵鏇炩攽?pane 濠电姷鏁告慨浼村垂瑜版帗鍋夐柕蹇嬪€曠粈鍐┿亜韫囨挻鍣芥俊?   */
  private resizePaneInLayout(
    node: LayoutNode,
    targetPaneId: string,
    widthRatio?: number,
    heightRatio?: number,
    parentNode?: LayoutNode,
    childIndex?: number
  ): boolean {
    if (node.type === 'pane') {
      if (node.id === targetPaneId && parentNode && parentNode.type === 'split' && childIndex !== undefined) {
        // 闂傚倸鍊烽懗鍫曞箠閹剧粯鍊舵慨妯挎硾绾惧潡鏌熼幆鐗堫棄闁哄嫨鍎抽埀顒€鍘滈崑鎾绘煕閺囥劌澧柛鎿冨枛椤啴濡堕崱妯锋嫽闂佸搫鎷嬮崑濠傜暦?pane闂傚倸鍊烽悞锔锯偓绗涘懐鐭欓柟杈鹃檮閸庢銆掑锝呬壕闂佽鍨伴崯鎾箖閵忋倖鍋傞幖娣灮閳ь剦鍓熼弻锝嗘償閿濆棙姣勫銈庡幖閻楁捇骞冮敓鐘茬闁挎梻鏅崢楣冩⒑閸涘﹦绠撻悗姘煎墴閸┾偓妞ゆ巻鍋撴い顓炲槻閻ｇ兘骞嬮敂鑺ユ珳婵犮垼娉涢鍛村礈?sizes
        if (parentNode.direction === 'horizontal' && widthRatio !== undefined) {
          // 闂傚倷娴囧畷鍨叏閹绢噮鏁勯柛娑欐綑閻ゎ喗銇勯弽顐粶婵鐓￠弻銊モ攽閸℃ê顎涘┑鐐茬毞閺呯娀寮婚埄鍐ㄧ窞閻庯綆浜炴导宀勬⒑閻熸澘顥忛柛鎾跺枛瀵鏁撻悩鑼紲濠电姴锕ょ€氼剙鈻撳畝鍕拺閻犲洠鈧櫕鐏嶇紓渚囧枟閹瑰洭鐛崱娑樼妞ゆ棁鍋愰ˇ鏉款渻閵堝棗濮夊┑顔煎暱闇夐柣鎴ｅГ閻?
          const oldSize = parentNode.sizes[childIndex];
          parentNode.sizes[childIndex] = widthRatio;

          // 闂傚倸鍊搁崐鐑芥倿閿曚降浜归柛鎰典簽閻捇鏌ｉ姀銏╃劸闁藉啰鍠庨埞鎴︽偐閸欏鎮欑紓浣插亾闁糕剝绋掗悡鏇㈡煃閳轰礁鏆熼柍钘夘樀閹粙顢涘☉妯锋灆闂佸搫鏈粙鏍不濞戙垹绫嶉柍褜鍓熷鎼佸礋椤撶姷锛滃銈嗘礀閹冲孩鏅舵导瀛樼厓鐟滄粓宕滃杈╃煓闁圭儤顨呯粈澶嬩繆椤栨繍鍞虹紒璇叉閵囧嫰骞橀崡鐐典痪闂佺锕﹂崗姗€寮诲☉銏℃櫆閻犲洦褰冪粻娲⒑娴兼瑧鍒扮€规洦鍓熼垾锕傚锤濡も偓闁卞洭鏌涢埄鍐炬當闁哄棛鍠愰幈?

          const remaining = 1 - widthRatio;
          const otherCount = parentNode.sizes.length - 1;
          for (let i = 0; i < parentNode.sizes.length; i++) {
            if (i !== childIndex) {
              parentNode.sizes[i] = remaining / otherCount;
            }
          }
        } else if (parentNode.direction === 'vertical' && heightRatio !== undefined) {
          // 闂傚倷娴囧畷鍨叏閹绢噮鏁勯柛娑欐綑閻ゎ喗銇勯弽顐粶婵鐓￠弻銊モ攽閸♀晜笑闂佹悶鍔岄崐鍧楀蓟濞戞矮娌柛鎾楀懐鍘戠紓鍌欒兌閾忓酣宕归崼鏇炶摕闁跨喓濮寸壕鍏肩節婵犲倸顏╂繛鍫濈焸濮婅櫣鎷犻垾铏亶缂備緡鍠楅幑鍥嵁閸℃稑绀冩い鏃囧亹椤︽澘顪冮妶鍡楀濠殿喖鍟块湁闁绘垼濮ら悡?          parentNode.sizes[childIndex] = heightRatio;
          const remaining = 1 - heightRatio;
          const otherCount = parentNode.sizes.length - 1;
          for (let i = 0; i < parentNode.sizes.length; i++) {
            if (i !== childIndex) {
              parentNode.sizes[i] = remaining / otherCount;
            }
          }
        }

        return true;
      }
      return false;
    }

    // 闂傚倸鍊风欢姘焽閼姐倖瀚婚柣鏃傚帶缁€澶屸偓鍏夊亾闁告洦鍓欐禒鍗炩攽閻愬弶顥為柟绋款煼瀹曢潧顓兼径瀣幈闁诲繒鍋涙晶浠嬫儗婵犲伅褰掓偑閳ь剟宕规导鏉戠叀濠㈣埖鍔曠粻濂告煕閹扳晛濡肩紒鐘虫そ濮婅櫣绱掑Ο缁樺創缂備胶绮换鍫ユ偘?

    for (let i = 0; i < node.children.length; i++) {
      if (this.resizePaneInLayout(node.children[i], targetPaneId, widthRatio, heightRatio, node, i)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?send-keys
   */
  private async handleSendKeys(parsed: any, request: TmuxCommandRequest): Promise<TmuxCommandResponse> {
    try {
      const options = TmuxCommandParser.parseSendKeysOptions(parsed);
      this.debugLog(request, 'send-keys request', {
        target: options.target,
        keys: options.keys,
        hasEnter: options.hasEnter,
      });

      // 闂傚倷娴囧畷鐢稿窗閹扮増鍋￠弶鍫氭櫅缁躲倕螖閿濆懎鏆為柛濠囨涧闇夐柣妯烘▕閸庢劙鏌涙惔鈥愁劉闁靛洤瀚板顕€宕掑☉娆戝涧闂?pane

      const targetInfo = TmuxCommandParser.parseTarget(options.target);
      if (targetInfo.type !== 'pane' || !targetInfo.paneId) {
        this.debugLog(request, 'send-keys invalid target', {
          target: options.target,
          parsedTarget: targetInfo,
        });
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: invalid target\n',
        };
      }

      const resolved = this.resolvePaneTarget(targetInfo.paneId, request);
      if (!resolved?.paneId) {
        this.debugLog(request, 'send-keys failed to resolve pane', {
          target: options.target,
          tmuxPaneId: targetInfo.paneId,
        });
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: can\'t find pane\n',
        };
      }

      this.debugLog(request, 'send-keys resolved pane', resolved);

      // 闂傚倸鍊风粈渚€骞栭銈嗗仏妞ゆ劧绠戠壕鍧楁煕濞嗗浚妲洪柣?PID

      const pid = this.config.processManager.getPidByPane(resolved.windowId, resolved.paneId);
      if (!pid) {
        this.debugLog(request, 'send-keys target pane has no pid', resolved);
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: pane not running\n',
        };
      }

      this.debugLog(request, 'send-keys resolved pid', { pid, ...resolved });

      // 闂傚倸鍊烽懗鍫曞箠閹捐搴婇柡灞诲劚鐟欙箓鎮楅敐搴″闁哄棙绮撻弻鐔虹磼閵忕姵鐏堢紓浣哄У濠㈡﹢鈥﹂崸妤佸殝闂傚牊绋戦～宥夋⒑閸濆嫭顥為柣鈺婂灦閻涱噣寮介鐐甸獓闂佺懓顕慨鐑筋敊閸ヮ剚鈷?

      let keys = options.keys.join(' ');
      if (options.hasEnter) {
        keys += '\r';
      }

      const originalKeys = keys;
      keys = this.adaptSendKeysForPane(keys, resolved.windowId, resolved.paneId, request);
      this.debugLog(request, 'send-keys payload', {
        originalPreview: originalKeys.slice(0, 300),
        adaptedPreview: keys.slice(0, 300),
        changed: originalKeys !== keys,
      });

      await this.waitForPaneStartupBarrier(resolved.windowId, resolved.paneId, request);

      // 闂傚倸鍊风粈渚€骞夐敓鐘茬闁哄稁鍘介崑锟犳煏婢跺棙娅呴柣?PTY

      this.config.processManager.writeToPty(pid, keys);

      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    } catch (error: unknown) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?kill-pane
   */
  private async handleKillPane(parsed: any, request: TmuxCommandRequest): Promise<TmuxCommandResponse> {
    try {
      const target = parsed.options.target as string | undefined;
      if (!target) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: kill-pane requires -t option\n',
        };
      }

      // 闂傚倷娴囧畷鐢稿窗閹扮増鍋￠弶鍫氭櫅缁躲倕螖閿濆懎鏆為柛濠囨涧闇夐柣妯烘▕閸庢劙鏌涙惔鈥愁劉闁靛洤瀚板顕€宕掑☉娆戝涧闂?pane

      const targetInfo = TmuxCommandParser.parseTarget(target);
      if (targetInfo.type !== 'pane' || !targetInfo.paneId) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: invalid target\n',
        };
      }

      const resolved = this.resolvePaneTarget(targetInfo.paneId, request);
      if (!resolved?.paneId) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: can\'t find pane\n',
        };
      }

      // 缂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾闁诡啫鍕瘈闁搞儴鍩栭弲?PTY 闂傚倷绀侀幖顐λ囬锕€鐤炬繝濠傛噽閻瑩鏌熼幑鎰靛殭闁?

      const pid = this.config.processManager.getPidByPane(resolved.windowId, resolved.paneId);
      if (pid) {
        this.detachPaneRuntime(resolved.windowId, resolved.paneId, pid);
        await this.config.processManager.killProcess(pid);
      }

      const resolvedPaneId = resolved.paneId;

      // 濠?layout 闂傚倸鍊风粈渚€骞栭銈囩煋闁汇垻顭堥崹鍌炴煙閹澘袚闁搞倕鐗撻弻鐔衡偓鐢殿焾鍟搁梺娲诲幗閹告悂鍩為幋锔藉亹鐎规洖娴傞弳锟犳⒑?pane

      let windowRemoved = false;
      this.config.updateWindowStore((state: any) => {
        const window = state.windows.find((w: Window) => w.id === resolved.windowId);
        if (!window) {
          return;
        }

        const nextLayout = this.removePaneFromLayout(window.layout, resolvedPaneId);
        if (!nextLayout) {
          state.windows = state.windows.filter((item: Window) => item.id !== resolved.windowId);
          windowRemoved = true;
          return;
        }

        window.layout = nextLayout;
        if (window.activePaneId === resolvedPaneId) {
          const remainingPanes = this.getAllPanesFromLayout(nextLayout);
          window.activePaneId = remainingPanes[0]?.id || '';
        }
      });

      // 婵犵數濮烽弫鎼佸磻濞戔懞鍥敇閵忕姷顦梺纭呮彧缁犳垹绱?pane 闂傚倸鍊风粈渚€骞栭銈傚亾濮樼厧鏋熼柟渚垮姂楠炴﹢顢欓挊澶婂?

      this.unregisterPane(targetInfo.paneId);

      if (windowRemoved) {
        this.removeTmuxWindowByActualWindowId(resolved.windowId);
        this.emitWindowRemoved(resolved.windowId);
      } else {
        this.emitWindowSynced(resolved.windowId);
      }

      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    } catch (error: unknown) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  /**
   * 濠?layout 闂傚倸鍊风粈渚€骞栭銈囩煋闁汇垻顭堥崹鍌炴煙閹澘袚闁搞倕鐗撻弻鐔衡偓鐢殿焾鍟搁梺娲诲幗閹告悂鍩為幋锔藉亹鐎规洖娴傞弳锟犳⒑?pane
   */
  private removePaneFromLayout(node: LayoutNode, targetPaneId: string): LayoutNode | null {
    if (node.type === 'pane') {
      return node.id === targetPaneId ? null : node;
    }

    let hasChanges = false;
    const newChildren: LayoutNode[] = [];
    const remainingSizes: number[] = [];

    node.children.forEach((child, index) => {
      const nextChild = this.removePaneFromLayout(child, targetPaneId);
      if (nextChild !== child) {
        hasChanges = true;
      }
      if (nextChild !== null) {
        newChildren.push(nextChild);
        remainingSizes.push(node.sizes[index] ?? 0);
      }
    });

    if (!hasChanges) {
      return node;
    }

    if (newChildren.length === 0) {
      return null;
    }

    // 濠电姷鏁告慨鐑姐€傛禒瀣劦妞ゆ巻鍋撻柛鐔锋健閸┾偓妞ゆ巻鍋撶紓宥咃躬楠炲啫螣鐠囪尙绐為梺褰掑亰閸撴盯鎮￠幋婵愭富闁靛牆鎳愮粻浼存倵濮樼厧澧撮柛鈺傜洴瀵€燁槷婵℃彃鐗撻弻鐔虹磼閵忕姷浠╂繛瀛樼矌閸嬫挾鎹㈠☉銏犵闁绘劕鐡ㄩ崕搴㈢箾鐎涙鐭嬬紒顔芥崌楠炲啴宕崟銊︾€婚梺鍦亾濞兼瑥鈻撻悢鍏尖拺缂佸瀵у﹢鎵磼椤斿吋婀扮紒鍌涘浮椤㈡盯鎮欑€电寮虫繝鐢靛仦閸ㄦ儼鎽┑鐘亾闁规鍠楅崰鎰涙０浣藉厡缂佹劖姊婚埀顒冾潐濞测晝鎹㈠┑鍡欐殾闁诡垶鍋婂Σ楣冩⒑?

    // 闂傚倸鍊搁崐鐑芥倿閿曚降浜归柛鎰典簽閻捇鏌ｉ姀銏╃劸闁藉啰鍠庨埞鎴︽偐閹绘帩浠炬繝娈垮灠閵堟悂寮婚妸銉㈡婵☆垯璀︽导鈧梻?sizes

    const sizesChanged = newChildren.length !== node.children.length;
    const newSizes = sizesChanged
      ? this.normalizeSplitSizes(remainingSizes)
      : node.sizes;

    return {
      ...node,
      children: newChildren,
      sizes: newSizes,
    };
  }

  private normalizeSplitSizes(sizes: number[]): number[] {
    const normalizedSizes = sizes.map(size =>
      Number.isFinite(size) && size > 0 ? size : 0
    );
    const total = normalizedSizes.reduce((sum, size) => sum + size, 0);

    if (total <= 0) {
      return sizes.map(() => 1 / sizes.length);
    }

    return normalizedSizes.map(size => size / total);
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?select-pane
   */
  private handleSelectPane(parsed: any, request: TmuxCommandRequest): TmuxCommandResponse {
    try {
      const options = TmuxCommandParser.parseSelectPaneOptions(parsed);

      // 闂傚倷娴囧畷鐢稿窗閹扮増鍋￠弶鍫氭櫅缁躲倕螖閿濆懎鏆為柛濠囨涧闇夐柣妯烘▕閸庢劙鏌涙惔鈥愁劉闁靛洤瀚板顕€宕掑☉娆戝涧闂?pane

      const targetInfo = TmuxCommandParser.parseTarget(options.target);
      if (targetInfo.type !== 'pane' || !targetInfo.paneId) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: invalid target\n',
        };
      }

      const tmuxPaneId = targetInfo.paneId;
      const resolved = this.resolvePaneTarget(tmuxPaneId, request);
      if (!resolved?.paneId) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'tmux: can\'t find pane\n',
        };
      }

      // 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞存粌缍婇弻娑㈠Ψ椤旂厧顫╃紓浣哄缂嶄線寮婚垾宕囨殼妞ゆ梻鍘ч弳鐔访归悪鈧崣鍐箖?pane 闂傚倸鍊烽懗鍫曗€﹂崼銏″床闁圭増婢橀悿顔姐亜閺嶎偄浠滄慨瑙勭叀閺岋綁寮崒姘粯缂?

      let metadata = this.paneMetadata.get(tmuxPaneId);
      if (!metadata) {
        metadata = { tmuxPaneId };
        this.paneMetadata.set(tmuxPaneId, metadata);
      }

      // 闂傚倷娴囧畷鍨叏瀹曞洨鐭嗗ù锝堫潐濞呯姴霉閻樺樊鍎愰柛瀣典邯閺屾盯鍩勯崘顏佹闂佸憡鍔忛崑鎾绘⒒娴ｈ鍋犻柛搴㈡そ瀹曟粓鏁冮崒姘緢?

      if (options.title !== undefined) {
        metadata.title = options.title;
        this.emit('pane-title-changed', {
          tmuxPaneId,
          windowId: resolved.windowId,
          paneId: resolved.paneId,
          title: options.title,
        });
      }

      // 闂傚倷娴囧畷鍨叏瀹曞洨鐭嗗ù锝堫潐濞呯姴霉閻樺樊鍎愰柛瀣典邯閺屾盯鍩勯崘顏佹闂佸憡鍔忛崑鎾绘煟鎼达絾鍤€閻庢凹鍘界粩鐔煎幢濞嗘劕鍘归梺?

      if (options.style) {
        this.applyPaneStyle(tmuxPaneId, metadata, options.style);
        this.emit('pane-style-changed', {
          tmuxPaneId,
          windowId: resolved.windowId,
          paneId: resolved.paneId,
          metadata,
        });
      }

      // 闂傚倷娴囧畷鍨叏瀹曞洨鐭嗗ù锝堫潐濞呯姴霉閻樺樊鍎愰柛瀣典邯閺屾盯鍩勯崘鍓у姺闂佸磭绮Λ鍐蓟閿濆绠ｉ柣鎰閸ㄦ寧淇婇悽鍛婂亜闁稿繒鍘ф禒?pane

      if (!options.title && !options.style) {
        this.config.updateWindowStore((state: any) => {
          const window = state.windows.find((w: Window) => w.id === resolved.windowId);
          if (window) {
            window.activePaneId = resolved.paneId;
          }
        });
        this.emitWindowSynced(resolved.windowId);
      }

      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    } catch (error: unknown) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  /**
   * 闂傚倷娴囧畷鐢稿窗閹扮増鍋￠弶鍫氭櫅缁躲倕螖閿濆懎鏆為柛濠囨涧闇夐柣妯烘▕閸庢垹鈧鎸风欢姘跺箖鐟欏嫨鍋婇柟绋垮瘨娴犫晠鏌ｆ惔锝嗗殌妞わ妇鏁诲?pane 闂傚倸鍊风粈渚€骞栭銈囩煋闁圭虎鍠栨惔濠囨煠绾板崬澧い?   * 闂傚倸鍊风粈渚€骞栭銈囩煋闁割偅娲栭崒銊ф喐韫囨拹? "fg=colour196,bg=default" 闂?"#{pane-border-style}"
   */
  private applyPaneStyle(
    tmuxPaneId: TmuxPaneId,
    metadata: TmuxPaneMetadata,
    style: string,
    active: boolean = false,
  ): void {
    const parts = style.split(',');
    for (const part of parts) {
      const [key, value] = part.trim().split('=');
      if (!key || !value) continue;

      switch (key.trim()) {
        case 'fg':
          if (active) {
            metadata.activeBorderColor = this.tmuxColorToHex(value.trim());
          } else {
            metadata.borderColor = this.tmuxColorToHex(value.trim());
          }
          break;
        case 'bg':
          if (!active && value.trim() !== 'default') {
            metadata.activeBorderColor = this.tmuxColorToHex(value.trim());
          }
          break;
      }
    }
  }

  /**
   * 闂?tmux 濠电姷顣藉Σ鍛村磻閸℃ɑ娅犳俊銈呭暙閸ㄦ繈鐓崶銊︹拻闁绘繆娉涢埞鎴︽偐閹绘帗娈叉繝娈垮枟缁秹濡甸崟顖氱鐎广儱娴傚Σ顕€鏌熼崗鍏肩稇闁挎洏鍊濋崺?hex
   */
  private tmuxColorToHex(color: string): string {
    // tmux 濠电姷顣藉Σ鍛村磻閸℃ɑ娅犳俊銈呭暙閸ㄦ繈鐓崶銊︹拻闁绘繆娉涢埞鎴︽偐閸欏鎮欓梺鍛婄懃閿曨亪寮婚敐鍛傜喖宕归鐐嚄婵犵數鍋涢悧濠囧箖閸岀偛钃熼柕濞垮劗濡插牊淇婇婊冨付妞わ絾妞藉铏圭磼濡厧鈪归梺缁樼墪閵堟悂鐛崘鈺冾浄閻庯綆鈧厸鏅犻弻宥夊传閸曡埖鏁惧┑鐘灪鐢€愁潖濞差亝鍤冮柍鍝勶攻閺侇垰顪冮妶鍡樼缂侇喖楠稿嵄?
    const colorMap: Record<string, string> = {
      'black': '#000000',
      'red': '#ff0000',
      'green': '#00ff00',
      'yellow': '#ffff00',
      'blue': '#0000ff',
      'magenta': '#ff00ff',
      'cyan': '#00ffff',
      'white': '#ffffff',
      'colour196': '#ff0000',
      'colour46': '#00ff00',
      'colour21': '#0000ff',
      'colour226': '#ffff00',
      'colour201': '#ff00ff',
      'colour51': '#00ffff',
      'colour208': '#ff8700',
      'colour82': '#5fff00',
      'colour33': '#0087ff',
      'colour160': '#d70000',
      'colour240': '#585858',
      'default': '',
    };

    if (colorMap[color] !== undefined) {
      return colorMap[color];
    }

    // 闂傚倷娴囬褏鎹㈤幇顔藉床闁瑰濮靛畷鏌ユ煕閳╁啰鈯曢柛搴★攻閵囧嫰寮介妸褏鐓侀梺鍝ュТ濡繈寮婚妸銉㈡斀闁糕剝锕╁Λ銈夋⒑?colour{N} 闂傚倸鍊风粈渚€骞栭銈囩煋闁割偅娲栭崒銊ф喐韫囨拹?

    const colourMatch = color.match(/^colour(\d+)$/);
    if (colourMatch) {
      const n = parseInt(colourMatch[1], 10);
      return this.xterm256ToHex(n);
    }

    // 濠电姷鏁告慨鐑姐€傛禒瀣劦妞ゆ巻鍋撻柛鐔锋健閸┾偓妞ゆ巻鍋撶紓宥咃躬楠炲啫螣鐠囪尙绐炴繝鐢靛Т妤犳悂寮查悩缁樷拺闁兼祴鏂侀幏锟犳煕閹惧娲撮柟顖楀亾闂佸憡绋戦悺銊╂偂?hex 闂傚倸鍊风粈渚€骞栭銈囩煋闁割偅娲栭崒銊ф喐韫囨拹?

    if (color.startsWith('#')) {
      return color;
    }

    return '';
  }

  /**
   * xterm 256 闂傚倸鍊峰ù鍥磻閹拌埇鈧焦绻濋崟顏嗗墾濡炪倕绻愭繛?hex
   */
  private xterm256ToHex(n: number): string {
    if (n < 16) {
      // 闂傚倸鍊风粈渚€骞栭銈囩煋闁哄鍤氬ú顏勎у璺猴躬濡?16 闂?
      const standard = [
        '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
        '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
      ];
      return standard[n] || '#ffffff';
    }

    if (n < 232) {
      // 216 闂傚倸鍊峰ù鍥磻閹拌埇鈧焦绻濋崟顏嗗墾濠电偛妫欓幐濠氬磻閻斿摜绠鹃柟瀛樼懃閻忊晜淇婇锝忚€挎慨濠冩そ椤㈡洟鏁愰崶銉㈠亾閹烘梻纾?
      const idx = n - 16;
      const r = Math.floor(idx / 36);
      const g = Math.floor((idx % 36) / 6);
      const b = idx % 6;
      const toHex = (v: number) => {
        const val = v === 0 ? 0 : 55 + v * 40;
        return val.toString(16).padStart(2, '0');
      };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    // 闂傚倸鍊峰ù鍥敋瑜忛幑銏ゅ箣濠垫劗鍞靛┑鈽嗗灠閻ㄧ兘宕?

    const gray = 8 + (n - 232) * 10;
    const hex = gray.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?set-option
   */
  private handleSetOption(parsed: any, request: TmuxCommandRequest): TmuxCommandResponse {
    try {
      const options = TmuxCommandParser.parseSetOptionOptions(parsed);
      const namespace = this.getNamespace(parsed, request);

      // 缂傚倸鍊烽懗鍫曟惞鎼淬劌鐭楅幖娣妼缁愭鏌″搴″箺闁稿鏅涜灃闁挎繂鎳庨弳鐐烘煕鎼粹€愁劉闁靛洤瀚板顕€宕掑☉娆戝涧闂?

      let tmuxPaneId: TmuxPaneId | undefined;
      let windowId: string | undefined;

      if (options.target) {
        const targetInfo = TmuxCommandParser.parseTarget(options.target);
        if (targetInfo.type === 'pane' && targetInfo.paneId) {
          tmuxPaneId = targetInfo.paneId;
          const resolved = this.resolvePaneTarget(tmuxPaneId, request);
          if (resolved) {
            windowId = resolved.windowId;
          }
        } else if (targetInfo.type === 'window') {
          windowId = this.resolveWindowTarget(options.target, namespace) ?? undefined;
        }
      } else {
        tmuxPaneId = this.getRequestTmuxPaneId(request);
        windowId = request.windowId;
      }

      // 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?pane 缂傚倸鍊搁崐鐑芥嚄閸撲讲鍋撳顒傜鐎规洖鐖奸弫鎰板川椤掆偓椤ユ艾鈹戦悩顔肩伇闁糕晜鐗犲畷婵嬪箣閿曗偓閻?

      if (options.pane && tmuxPaneId) {
        let metadata = this.paneMetadata.get(tmuxPaneId);
        if (!metadata) {
          metadata = { tmuxPaneId };
          this.paneMetadata.set(tmuxPaneId, metadata);
        }

        switch (options.optionName) {
          case 'pane-border-style':
            this.applyPaneStyle(tmuxPaneId, metadata, options.optionValue);
            break;
          case 'pane-active-border-style':
            this.applyPaneStyle(tmuxPaneId, metadata, options.optionValue, true);
            break;
          case 'pane-border-format':
            metadata.title = options.optionValue
              .replace(/#\[[^\]]*\]/g, '')
              .replace(/#\{pane_title\}/g, metadata.title || '')
              .trim();
            break;
        }

        if (metadata.title) {
          const resolved = this.resolvePaneTarget(tmuxPaneId, request);
          if (resolved) {
            this.emit('pane-title-changed', {
              tmuxPaneId,
              windowId,
              paneId: resolved.paneId,
              title: metadata.title,
            });
          }
        }

        if (windowId) {
          const resolved = this.resolvePaneTarget(tmuxPaneId, request);
          this.emit('pane-style-changed', {
            tmuxPaneId,
            windowId,
            paneId: resolved?.paneId,
            metadata,
          });
        }
      }

      if (options.window && windowId && options.optionName === 'pane-border-status') {
        this.emitWindowSynced(windowId);
      }

      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    } catch (error: unknown) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?has-session
   */
  private handleHasSession(parsed: any, request: TmuxCommandRequest): TmuxCommandResponse {
    const namespace = this.getNamespace(parsed, request);
    const target = (parsed.options.target as string | undefined) || parsed.args[0];
    if (!target) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: has-session requires -t option\n',
      };
    }

    const sessionName = this.getSessionNameFromTarget(target);
    const exists = !!this.findSession(sessionName, namespace);
    return {
      exitCode: exists ? 0 : 1,
      stdout: '',
      stderr: exists ? '' : `tmux: can't find session: ${sessionName}\n`,
    };
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?new-session
   */
  private async handleNewSession(parsed: any, request: TmuxCommandRequest): Promise<TmuxCommandResponse> {
    const namespace = this.getNamespace(parsed, request);
    const sessionName = parsed.options.sessionName as string | undefined;
    if (!sessionName) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: new-session requires -s option\n',
      };
    }

    if (this.findSession(sessionName, namespace)) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: duplicate session: ${sessionName}\n`,
      };
    }

    const session = this.getOrCreateSession(sessionName, namespace);
    const windowName = (parsed.options.windowName as string | undefined) || sessionName;
    const shouldCreateInitialWindow = Boolean(parsed.options.print || parsed.options.windowName || parsed.args.length > 0);

    if (!shouldCreateInitialWindow) {
      session.hidden = true;
      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    }

    const paneId = randomUUID();
    const tmuxPaneId = this.allocatePaneId();
    const pane: Pane = {
      id: paneId,
      cwd: (parsed.options.startDirectory as string | undefined) || request.cwd || process.cwd(),
      command: 'shell',
      status: WindowStatus.Paused,
      pid: null,
    };

    const window = this.createInternalWindow(windowName, pane, false);
    this.addWindowToStore(window);
    this.registerTmuxWindow(sessionName, namespace, window.id, windowName, true, false);
    this.registerPane(tmuxPaneId, window.id, paneId);

    try {
      await this.spawnPaneShell(window.id, paneId, pane.cwd, parsed.args.join(' ') || undefined);
    } catch (error) {
      console.error('[TmuxCompatService] Failed to spawn new-session pane:', error);
    }

    this.emitWindowSynced(window.id);

    if (parsed.options.print) {
      const output = parsed.options.format
        ? this.formatString(parsed.options.format as string, {
            tmuxPaneId,
            windowId: window.id,
            paneId,
            namespace,
          })
        : tmuxPaneId;

      return {
        exitCode: 0,
        stdout: `${output}\n`,
        stderr: '',
      };
    }

    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?list-windows
   */
  private handleListWindows(parsed: any, request: TmuxCommandRequest): TmuxCommandResponse {
    const namespace = this.getNamespace(parsed, request);
    const target = (parsed.options.target as string | undefined) || parsed.args[0];
    if (!target) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: list-windows requires -t option\n',
      };
    }

    const sessionName = this.getSessionNameFromTarget(target);
    const session = this.findSession(sessionName, namespace);
    if (!session) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: can't find session: ${sessionName}\n`,
      };
    }

    const lines = session.windows
      .sort((left, right) => left.index - right.index)
      .map((window) => {
        if (parsed.options.format) {
          return this.formatString(parsed.options.format as string, {
            windowId: window.actualWindowId,
            namespace,
          });
        }

        return window.name;
      });

    return {
      exitCode: 0,
      stdout: lines.length > 0 ? `${lines.join('\n')}\n` : '',
      stderr: '',
    };
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?new-window
   */
  private async handleNewWindow(parsed: any, request: TmuxCommandRequest): Promise<TmuxCommandResponse> {
    const namespace = this.getNamespace(parsed, request);
    const target = parsed.options.target as string | undefined;
    if (!target) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: new-window requires -t option\n',
      };
    }

    const sessionName = this.getSessionNameFromTarget(target);
    const session = this.findSession(sessionName, namespace);
    if (!session) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: can't find session: ${sessionName}\n`,
      };
    }

    const windowName = (parsed.options.windowName as string | undefined) || `window-${session.windows.length}`;
    const paneId = randomUUID();
    const tmuxPaneId = this.allocatePaneId();
    const pane: Pane = {
      id: paneId,
      cwd: (parsed.options.startDirectory as string | undefined) || request.cwd || process.cwd(),
      command: 'shell',
      status: WindowStatus.Paused,
      pid: null,
    };

    const window = this.createInternalWindow(windowName, pane, false);
    this.addWindowToStore(window);
    this.registerTmuxWindow(sessionName, namespace, window.id, windowName, true, false);
    this.registerPane(tmuxPaneId, window.id, paneId);

    try {
      await this.spawnPaneShell(window.id, paneId, pane.cwd, parsed.args.join(' ') || undefined);
    } catch (error) {
      console.error('[TmuxCompatService] Failed to spawn new-window pane:', error);
    }

    this.emitWindowSynced(window.id);

    const output = parsed.options.print
      ? (parsed.options.format
        ? this.formatString(parsed.options.format as string, {
            tmuxPaneId,
            windowId: window.id,
            paneId,
            namespace,
          })
        : tmuxPaneId)
      : '';

    return {
      exitCode: 0,
      stdout: output ? `${output}\n` : '',
      stderr: '',
    };
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?break-pane
   */
  private async handleBreakPane(parsed: any, request: TmuxCommandRequest): Promise<TmuxCommandResponse> {
    const namespace = this.getNamespace(parsed, request);
    const sourceTarget = parsed.options.sessionName as string | undefined;
    const target = parsed.options.target as string | undefined;
    if (!sourceTarget || !target) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: break-pane requires -s and -t options\n',
      };
    }

    const sourceInfo = TmuxCommandParser.parseTarget(sourceTarget);
    if (sourceInfo.type !== 'pane' || !sourceInfo.paneId) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: invalid source pane\n',
      };
    }

    const resolved = this.resolvePaneId(sourceInfo.paneId);
    if (!resolved) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: can\'t find pane\n',
      };
    }

    const sourcePane = this.findPane(resolved.windowId, resolved.paneId);
    if (!sourcePane) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: can\'t find pane\n',
      };
    }

    const hiddenSessionName = this.getSessionNameFromTarget(target);
    const hiddenSession = this.getOrCreateSession(hiddenSessionName, namespace);
    hiddenSession.hidden = true;

    const hiddenWindow = this.createInternalWindow(
      `${hiddenSessionName}-${sourcePane.title || sourcePane.id.slice(0, 8)}`,
      { ...sourcePane },
      true,
    );

    let sourceWindowRemoved = false;
    this.config.updateWindowStore((state: any) => {
      const sourceWindow = state.windows.find((window: Window) => window.id === resolved.windowId);
      if (!sourceWindow) {
        throw new Error('Source window not found');
      }

      const nextLayout = this.removePaneFromLayout(sourceWindow.layout, resolved.paneId);
      if (!nextLayout) {
        state.windows = state.windows.filter((window: Window) => window.id !== resolved.windowId);
        sourceWindowRemoved = true;
      } else {
        sourceWindow.layout = nextLayout;
        if (sourceWindow.activePaneId === resolved.paneId) {
          sourceWindow.activePaneId = this.getAllPanesFromLayout(nextLayout)[0]?.id || '';
        }
      }

      state.windows.push(hiddenWindow);
    });

    this.registerTmuxWindow(hiddenSessionName, namespace, hiddenWindow.id, hiddenWindow.name, true, true);
    this.rebindPaneMapping(sourceInfo.paneId, hiddenWindow.id, resolved.paneId);
    this.movePaneRuntime(resolved.windowId, resolved.paneId, hiddenWindow.id);

    if (sourceWindowRemoved) {
      this.removeTmuxWindowByActualWindowId(resolved.windowId);
      this.emitWindowRemoved(resolved.windowId);
    } else {
      this.emitWindowSynced(resolved.windowId);
    }
    this.emitWindowSynced(hiddenWindow.id);

    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?join-pane
   */
  private async handleJoinPane(parsed: any, request: TmuxCommandRequest): Promise<TmuxCommandResponse> {
    const namespace = this.getNamespace(parsed, request);
    const sourceTarget = parsed.options.sessionName as string | undefined;
    const target = parsed.options.target as string | undefined;
    if (!sourceTarget || !target) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: join-pane requires -s and -t options\n',
      };
    }

    const sourceInfo = TmuxCommandParser.parseTarget(sourceTarget);
    if (sourceInfo.type !== 'pane' || !sourceInfo.paneId) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: invalid source pane\n',
      };
    }

    const resolved = this.resolvePaneId(sourceInfo.paneId);
    if (!resolved) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: can\'t find pane\n',
      };
    }

    const targetWindowId = this.resolveWindowTarget(target, namespace);
    if (!targetWindowId) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: can\'t find window\n',
      };
    }

    const sourcePane = this.findPane(resolved.windowId, resolved.paneId);
    if (!sourcePane) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: can\'t find pane\n',
      };
    }

    const movedPane = { ...sourcePane };
    const direction = parsed.options.horizontal ? 'horizontal' : 'vertical';
    const targetWindow = this.getWindowById(targetWindowId);
    const requestTargetTmuxPaneId = this.getRequestTmuxPaneId(request);
    const requestTargetPaneId = requestTargetTmuxPaneId
      ? this.resolvePaneTarget(requestTargetTmuxPaneId, request)
      : null;
    const activeTargetPane = targetWindow?.activePaneId
      ? this.findPane(targetWindowId, targetWindow.activePaneId)
      : null;
    const targetPane = requestTargetPaneId?.windowId === targetWindowId
      ? this.findPane(targetWindowId, requestTargetPaneId.paneId ?? '')
      : (activeTargetPane && isTerminalPane(activeTargetPane)
        ? activeTargetPane
        : this.getAllTerminalPanes(targetWindowId)[0] || null);

    if (!targetPane || !isTerminalPane(targetPane)) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: can\'t find pane\n',
      };
    }

    const tmuxScopeId = targetPane.tmuxScopeId || movedPane.tmuxScopeId || randomUUID();
    movedPane.tmuxScopeId = tmuxScopeId;
    let sourceWindowRemoved = false;

    this.config.updateWindowStore((state: any) => {
      const sourceWindow = state.windows.find((window: Window) => window.id === resolved.windowId);
      const targetWindow = state.windows.find((window: Window) => window.id === targetWindowId);
      if (!sourceWindow || !targetWindow) {
        throw new Error('Source or target window not found');
      }

      const nextLayout = this.removePaneFromLayout(sourceWindow.layout, resolved.paneId);
      if (!nextLayout) {
        state.windows = state.windows.filter((window: Window) => window.id !== resolved.windowId);
        sourceWindowRemoved = true;
      } else {
        sourceWindow.layout = nextLayout;
        if (sourceWindow.activePaneId === resolved.paneId) {
          sourceWindow.activePaneId = this.getAllPanesFromLayout(nextLayout)[0]?.id || '';
        }
      }

      if (!targetPane.tmuxScopeId) {
        this.assignPaneScopeInLayout(targetWindow.layout, targetPane.id, tmuxScopeId);
      }

      if (targetWindow.layout.type === 'pane' && targetWindow.layout.id === targetPane.id) {
        targetWindow.layout = {
          type: 'split',
          direction,
          sizes: [0.5, 0.5],
          children: [
            targetWindow.layout,
            {
              type: 'pane',
              id: movedPane.id,
              pane: movedPane,
            },
          ],
        };
      } else {
        this.splitPaneInLayout(targetWindow.layout, targetPane.id, movedPane, direction, 0.5);
      }
    });

    this.rebindPaneMapping(sourceInfo.paneId, targetWindowId, movedPane.id);
    this.movePaneRuntime(resolved.windowId, movedPane.id, targetWindowId);

    if (sourceWindowRemoved) {
      this.removeTmuxWindowByActualWindowId(resolved.windowId);
      this.emitWindowRemoved(resolved.windowId);
    } else {
      this.emitWindowSynced(resolved.windowId);
    }
    this.emitWindowSynced(targetWindowId);

    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?kill-session
   */
  private async handleKillSession(parsed: any, request: TmuxCommandRequest): Promise<TmuxCommandResponse> {
    const namespace = this.getNamespace(parsed, request);
    const target = (parsed.options.target as string | undefined) || parsed.args[0];
    if (!target) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'tmux: kill-session requires -t option\n',
      };
    }

    const sessionName = this.getSessionNameFromTarget(target);
    const sessionKey = `${namespace}:${sessionName}`;
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: can't find session: ${sessionName}\n`,
      };
    }

    for (const tmuxWindow of [...session.windows]) {
      const window = this.getWindowById(tmuxWindow.actualWindowId);
      if (!window) {
        continue;
      }

      if (tmuxWindow.managed) {
        const panes = this.getAllTerminalPanes(window.id);
        for (const pane of panes) {
          const tmuxPaneId = this.getTmuxPaneId(window.id, pane.id);
          const pid = this.config.processManager.getPidByPane(window.id, pane.id);
          if (pid) {
            this.detachPaneRuntime(window.id, pane.id, pid);
            try {
              await this.config.processManager.killProcess(pid);
            } catch {}
          }
          if (tmuxPaneId) {
            this.unregisterPane(tmuxPaneId);
          }
        }

        this.removeWindowFromStore(window.id);
        this.emitWindowRemoved(window.id);
        continue;
      }

      const collapseResult = this.collapseTmuxScopesInWindow(window);
      for (const paneId of collapseResult.affectedPaneIds) {
        const pid = this.config.processManager.getPidByPane(window.id, paneId);
        const tmuxPaneId = this.getTmuxPaneId(window.id, paneId);
        if (pid) {
          this.detachPaneRuntime(window.id, paneId, pid);
          try {
            await this.config.processManager.killProcess(pid);
          } catch {}
        }
        if (tmuxPaneId) {
          this.unregisterPane(tmuxPaneId);
        }
      }

      const panes = this.getAllTerminalPanes(window.id);
      for (const pane of panes) {
        const tmuxPaneId = this.getTmuxPaneId(window.id, pane.id);
        if (tmuxPaneId) {
          this.unregisterPane(tmuxPaneId);
        }
      }

      this.emitWindowSynced(window.id);
    }

    this.sessions.delete(sessionKey);

    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?switch-client
   */
  private handleSwitchClient(parsed: any, request: TmuxCommandRequest): TmuxCommandResponse {
    return this.handleSessionAttachLike(parsed, request, 'switch-client');
  }

  /**
   * 濠电姷鏁告慨浼村垂閻撳簶鏋栨繛鎴炲焹閸嬫挸顫濋悡搴㈢彎濡?attach-session
   */
  private handleAttachSession(parsed: any, request: TmuxCommandRequest): TmuxCommandResponse {
    return this.handleSessionAttachLike(parsed, request, 'attach-session');
  }

  /**
   * attach-session / switch-client 闂傚倸鍊烽悞锕傛儑瑜版帒绀夌€光偓閳ь剟鍩€椤掍礁鍤柛鎾跺枎閻ｇ兘濡疯閸嬫捇鏁愭惔鈥冲箣闂佺顑嗛幑鍥х暦閻戠瓔鏁囬柣鏃堟敱閻ｎ剟姊绘担鍦菇闁稿﹥娲滈埀顒佺煯閸楁娊鐛?   */
  private handleSessionAttachLike(parsed: any, request: TmuxCommandRequest, commandName: string): TmuxCommandResponse {
    const namespace = this.getNamespace(parsed, request);
    const target = (parsed.options.target as string | undefined) || parsed.args[0];
    if (!target) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: ${commandName} requires -t option\n`,
      };
    }

    const sessionName = this.getSessionNameFromTarget(target);
    if (!this.findSession(sessionName, namespace)) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `tmux: can't find session: ${sessionName}\n`,
      };
    }

    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
  }

  /**
   * 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞?pane 闂傚倸鍊烽懗鍫曗€﹂崼銏″床闁圭増婢橀悿顔姐亜閺嶎偄浠滄慨瑙勭叀閺岋綁寮崒姘粯缂?   */
  getPaneMetadata(tmuxPaneId: TmuxPaneId): TmuxPaneMetadata | undefined {
    return this.paneMetadata.get(tmuxPaneId);
  }

  /**
   * 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞?tmux pane ID闂傚倸鍊烽悞锔锯偓绗涘懐鐭欓柟杈鹃檮閸嬪鏌熼幑鎰靛殭闁绘帒鐏氶妵鍕箳瀹ュ棭妯傛繛瀛樺殠閸ㄨ崵妲愰幒鏃€瀚氶柟缁樺笚濞堝鎮楃憴鍕闁挎洏鍨归悾鐑藉Ω閳轰胶楠囬梺鐟扮摠缁诲倽顣?pane ID闂?   */
  getTmuxPaneId(windowId: string, paneId: string): TmuxPaneId | undefined {
    const reverseKey = `${windowId}:${paneId}`;
    return this.reversePaneIdMap.get(reverseKey);
  }
}
