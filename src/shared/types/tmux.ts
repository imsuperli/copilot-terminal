/**
 * tmux 闂傚倷鑳堕…鍫㈡崲閹烘鍌ㄧ憸鏃堛€佸▎鎾崇疀妞ゆ梻绮崟鍐⒑缁嬫寧婀扮紒顔肩箻閿濈偤鏁冮崒娑氬幈闂侀潧顭堥崕娲磿韫囨稒鐓熼柨婵嗘搐娴滃墽绱? *
 * 闂傚倷绀侀幖顐︽偋濠婂牆绀堟慨妯挎硾閸戠娀鏌涢幇銊︽珖妞も晝鍏橀幃瑙勩偊閹稿寒浠╅梺鍝勬濠㈡﹢鍩ユ径鎰婵炲棛鍋撳暩缂?tmux 闂傚倷鑳堕…鍫㈡崲閹烘鍌ㄧ憸鏃堛€佸▎鎾崇疀妞ゆ梻绮崟鍐⒑缁嬫寧婀扮紒瀣灴閵嗗倿寮婚妷锔规嫽闂佹悶鍎荤徊鑺ョ妤ｅ啯鈷戞慨鐟版搐婵″ジ鎮楀鐓庡籍闁诡啫鍛亾閸︻厼啸闁汇倐鍋撻梻浣告啞閸旓附绂嶉敐澶涚稏闁挎洖鍊归悡鏇㈡煏婵炲灝鍔撮柛搴㈢矌缁辨帗娼忛妸褏鐤勯梺璇″枙缁瑦淇婇幖浣肝ч柛銉簻椤ユ繈姊绘担濮愨偓鈧柛瀣尰閵囧嫰寮介妸褉妲堥梺?Claude Code Agent Teams 闂傚倷绀侀幉鈥愁潖婵犳艾绐楅柡鍥ュ灩缁€鍌涙叏濡炶浜炬繝? * 婵犵數鍋為崹鍫曞箰閸濄儳鐭撻柣鎴ｆ缁狀垳鈧懓瀚板蹇氼樄鐎规洘甯掗～婵囨綇閵婏富鍞撮梻?tmux 闂備浇顕ф绋匡耿闁秴纾婚柣鏃囧亹瀹撲線鏌涢妷顔煎闁哄拋鍓熼幃姗€鎮欑捄杞版睏闂佹椿鍘奸惌鍌炲蓟濞戞粎鐤€闁哄洨鍋涙禒妯侯渻?Claude Code 闂備浇顕ф绋匡耿闁秴纾婚柕鍫濇媼閻庤埖銇勯弽銊р姇濠殿垱鎸抽幃褰掑箒閹烘垵顬夐梺鍝勬缁绘﹢寮婚敐澶娢╅柕澶堝労娴犲ジ姊虹憴鍕伇闁告挻绻勭划瀣箳濡も偓鍥撮梺鍛婁緱閸ㄩ亶骞夐妶澶嬧拻闁稿本纰嶉ˉ婊勪繆椤愩垽鍙勯柛鈹惧亾? */

/**
 * tmux 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵囧窛閻忓繒鏁婚幃褰掑炊椤忓嫮姣㈤梺閫炲苯澧伴柛蹇斆锝囩矙濞嗙偓鍍靛銈嗗姂閸╁嫬煤椤撱垺鈷戦柟绋挎捣閳藉绻濋埀? 婵犵數鍋炲娆撳触鐎ｎ喗鏅梻浣告啞钃辩紒瀣崌閹偓妞ゅ繐娴傚顏嗙磽? */
export enum TmuxCommand {
  Version = '-V',
  DisplayMessage = 'display-message',
  ListPanes = 'list-panes',
  ListWindows = 'list-windows',
  HasSession = 'has-session',
  SplitWindow = 'split-window',
  KillPane = 'kill-pane',
  SelectPane = 'select-pane',
  ResizePane = 'resize-pane',
  SendKeys = 'send-keys',
  SelectLayout = 'select-layout',
  NewSession = 'new-session',
  KillSession = 'kill-session',
  AttachSession = 'attach-session',
  SwitchClient = 'switch-client',
  NewWindow = 'new-window',
  SetOption = 'set-option',
  BreakPane = 'break-pane',
  JoinPane = 'join-pane',
}

/**
 * tmux layout values
 */
export enum TmuxLayout {
  MainVertical = 'main-vertical',
  Tiled = 'tiled',
  EvenHorizontal = 'even-horizontal',
  EvenVertical = 'even-vertical',
}

/****
 * tmux Pane ID 闂傚倷绀侀幖顐ょ矓閸洖鍌ㄧ憸蹇撐ｉ幇鐗堟櫢闁绘娅曞▍?1, %2, %3...
 */
export type TmuxPaneId = string;

/**
 * tmux Session 闂傚倷绀侀幉锟犳嚌閸撗呯煋闁诡垱澹嬮崣?
 */
export type TmuxSessionName = string;

/**
 * tmux Window Target 闂傚倷绀侀幖顐ょ矓閸洖鍌ㄧ憸蹇撐ｉ幇鐗堟櫢闁绘娅曞▍?session>:<index> 闂?<session>:<windowName>
 */
export type TmuxWindowTarget = string;

/**
 * tmux 闂傚倷绀侀幖顐ょ矓閸洖鍌ㄧ憸蹇撐ｉ幇鐗堟櫢闁绘灏欓ˇ閬嶆⒑閸濆嫯鐧侀柛娑卞枟閸犳洘绻? */
export enum TmuxFormatField {
  PaneId = '#{pane_id}',
  SessionName = '#{session_name}',
  WindowIndex = '#{window_index}',
  WindowName = '#{window_name}',
  PaneTitle = '#{pane_title}',
}

/**
 * tmux 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵囧閻庢碍宀稿娲垂椤曞懎鍓冲┑鐘亾闁圭虎鍠楅悡銉︾箾閹寸儐鐒藉褎姊荤槐?shim 闂傚倷绀侀幉锟犳偡閿曞倸鍨傞柛褎顨呴悞鍨亜閹达絾纭舵い锔肩畵閺屾盯鍩℃担瑙勬嫳缂備礁顑呴ˇ闈涱嚕閹峰瞼鐤€闁哄洨濯崯瀣磽閸屾瑧顦︽い鎴濇嚇椤㈡牠骞嬮悩鎰佹綗? */
export interface TmuxCommandRequest {
  /** 闂備浇顕уù鐑藉箠閹捐瀚夋い鎺戝濮规煡鏌ㄥ┑鍡╂Ч闁稿骸绉归弻娑㈠即閵娿儰绨奸梺鎼炲€栫敮鎺楁箒闂佺粯锕╅崰鏍焵椤掍胶娲撮柕鍡曠窔楠炲鏁冮埀顒勬儗濡ゅ懏鐓曢悘鐐插⒔閳洘绻涢崼婵堝煟闁哄备鍓濋幏鍛存偡闁附顥嬬紓?*/
  argv: string[];

  /** 闂佽崵鍠愮划搴㈡櫠濡ゅ懎绠伴柛娑橈攻濞呯娀鏌ｅΟ鍏兼毄闁绘粎绮穱濠囧Χ閸屾矮澹曢柣?ID闂傚倷鐒︾€笛呯矙閹达附鍋嬮柛娑卞灠閸ㄦ繈鏌ｅΟ鑲╁笡闁稿绻冮妵鍕冀閵娿儱姣堥梺鍝勬濡啴寮诲☉妯锋瀻闁圭増鍎奸埀顒€娼￠弻娑㈡晲閸噥浠╅梺褰掝棑婵兘骞忛悩璇茬闁圭儤姊归崑褔姊?*/
  windowId?: string;

  /** 闂佽崵鍠愮划搴㈡櫠濡ゅ懎绠伴柛娑橈攻濞呯娀鏌ｅΟ鍏兼毄闁绘粎绮穱濠囧Χ閸曨喖鍘℃繝?ID闂傚倷鐒︾€笛呯矙閹达附鍋嬮柛娑卞灠閸ㄦ繈鏌ｅΟ鑲╁笡闁稿绻冮妵鍕冀閵娿儱姣堥梺鍝勬濡啴寮诲☉妯锋瀻闁圭増鍎奸埀顒€娼￠弻娑㈡晲閸噥浠╅梺褰掝棑婵兘骞忛悩璇茬闁圭儤姊归崑褔姊?*/
  paneId?: TmuxPaneId;

  /** 闂傚倷绀侀幉锛勭矙閺嶎灛娑㈠礋椤栨氨鐣洪梺鍝勬川婵兘鎯屽顓犵鐎瑰壊鍠曠花濂告煥濞戞艾鏋涢柡灞诲妼閳藉螣閻撳寒鏆俊鐐€栧ú锕傚窗濡ゅ懎绠?-L socket 闂傚倷绀侀幉锟犳偡閵夆晛纾圭憸鐗堝笒濮规煡鏌ｉ弬鍨倯闁?*/
  namespace?: string;

  /** 闂佽姘﹂～澶愬箖閸洖纾块柟娈垮枤缁€濠囨煛閸愩劎澧涢柛搴″閵囧嫰寮崶褌姹楃紓浣割槸濞硷繝寮婚妸銉㈡婵☆垳鍘ч埅閬嶆⒑鏉炰即妾烽柛濠冪墱缁顓奸崱妯哄妳闂佹寧绻傚Λ娑㈠Χ閺屻儲鐓熼幖杈剧稻閺嗏晜銇勯姀鐙呰含闁诡垰鐭傞獮鍡氼檨闁搞倖顨婇弻娑㈠即閵娿儲娈ㄩ梺鍦劋椤ㄥ懘宕欓悩缁樼厵闁哄鐏濋。宕囩磼閳?*/
  cwd?: string;

  /** 闂備礁鎼€氱兘宕规导鏉戠畾濞撴埃鍋撶€规洏鍎甸、娑橆煥閸曨剚顓归梻浣告惈閻楁粓宕滃棰濇晝闁兼祴鏅滅€氭岸姊洪崹顕呭剳婵犫偓閹绢喗鐓熼柕濞垮劚椤忣剟鏌ｉ妸褍鏋旈柟椋庡█瀵挳鎮㈤棃鈺冪闂?*/
  debug?: boolean;

  /** 闂備礁鎼ˇ顓㈠磿閹绢喖鍚?shim 闂備焦鐪归崝宀€鈧凹鍨堕幆鍐偄閻戞ê鐝伴梺鍝勬处濮樸劑鎮烽幇顑芥闁圭偓鍓氶崕鎰版煛?*/
  debugContext?: {
    tmux?: string;
    tmuxPane?: string;
    rpcPath?: string;
    windowId?: string;
    paneId?: string;
    pid?: number;
    ppid?: number;
    platform?: string;
    cwd?: string;
    logFile?: string;
  };
}

/**
 * tmux 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵愭Ц濞磋偐濮烽埀顒€绠嶉崕閬嶅箠閹邦喒鍋撻悷閭︽█闁哄被鍔岄埥澶娢熼悡搴毆缂傚倷绶￠崰姘叏閻㈢數鐭欏鑸靛姇閸欏﹪鐓崶銊︾妞ゆ梹甯炵槐鎾存媴閸撴彃鍓板銈嗗灥閻楀繘骞戦姀銈呯闁挎洍鍋撻柣鎰躬閺岋綁骞囬鐐电シ闂?shim闂? */
export interface TmuxCommandResponse {
  /** 闂傚倸鍊风欢锟犲磻閳ь剟鏌涚€ｎ偅宕岄柡灞剧洴楠炲鏁愰崱鈺€鍝楅梻浣虹帛閻楁鍒掗幘璇叉瀬? 闂備浇宕甸崑鐐电矙韫囨稑绀夐幖娣妼妗呭┑顔筋焾濞夋稓绮婚敐澶嬬厵闂侇叏绠戞晶顔姐亜椤愩倕鈻堥柡?*/
  exitCode: number;

  /** 闂傚倷绀侀幖顐ょ矓閺夋嚚娲Χ婢跺﹪妫峰銈嗙墬缁嬫帞绱為崶顒佺厵闁诡垎鍐╂瘣濠?*/
  stdout: string;

  /** 闂傚倷绀侀幖顐ょ矓閺夋嚚娲Χ婢跺﹪妫峰銈嗙墱閸嬬偤鎮￠妷锔剧闁糕剝锚娣囶垶鏌涢妶鍡欏⒌鐎殿喖鐖煎畷濂告偄缁嬭法顣查梻?*/
  stderr: string;
}

/**
 * tmux Pane 闂傚倷鑳堕…鍫㈡崲閹版澘鐤い鏍仜濮规煡鏌ｉ弮鍌氬付缂佺姴寮堕妵鍕籍閸ヮ煈妫勯梺鎶芥敱閻楃娀骞冨鈧幃娆戔偓娑欘焽閳规稓绱撴担浠嬪摵闁荤喆鍎磋ぐ渚€鏌ｉ悩鍙夊鐟滄澘鍟撮敐鐐烘晲婢跺鍘遍梺鍦劋閹告悂藟鐎ｎ偒娈介柣鎰级閸犳鈧?Pane 闂傚倷娴囬～澶嬬娴犲纾块弶鍫亖娴滆绻涢幋娆忕仾闁? */
export interface TmuxPaneMetadata {
  /** tmux 婵犵绱曢崑娑㈩敄閸涱垪鍋撳☉鎺撴珚闁诡啫鍥х濞达絿鎳撻崜?pane ID闂?1, %2...闂?*/
  tmuxPaneId?: TmuxPaneId;

  /** Pane 闂傚倷绀侀幖顐ょ矓閺夋嚚娲敇椤兘鍋撻崒娑氼浄閻庯綆鍋呭▍鏍⒑閸撴彃浜栭柛搴櫍瀹曟垿骞橀幇浣瑰兊閻庤娲栧ú銊╂偩?select-pane -T 闂備浇宕垫慨宕囩矆娴ｈ娅犲ù鐘差儐閸嬵亪鏌涢埄鍐姇闁?*/
  title?: string;

  /** 闂備礁鎼ˇ顖炴偋閹板府缍栧鑸靛姂閳ь兛鑳堕埀顒婄秵閸嬫挾妲愰敐鍡欑瘈濠电姴鍊归ˉ婊勩亜閵夈儳绠婚柡灞诲妼閳藉螣閻撳簶鍙洪梻渚€鈧偛鑻晶顖毲庨崶顏咁仩闁?select-pane -P 闂?set-option 闂備浇宕垫慨宕囩矆娴ｈ娅犲ù鐘差儐閸嬵亪鏌涢埄鍐姇闁?*/
  borderColor?: string;

  /** 濠电姷鏁告慨鐑姐€傛禒瀣；闁规儳顕粻楣冩煕濞嗗浚妲规い顐ｎ殘缁辨帡寮崒姘€诲銈傛櫅閵堢鐣烽崡鐐╂閺夊牄鍔嶇欢顒勬⒒?*/
  activeBorderColor?: string;

  /** 闂傚倷鐒﹂幃鍫曞磿椤栫偛鍨傞柦妯猴級閿濆鏅濋柛灞句亢琚濋柣搴＄畭閸庡崬鈻旈敃鍌涘€烽柣鎴炆戝▍鏍⒑闂堚晠妾俊顖氬灧ude Agent Teams闂?*/
  teamName?: string;

  /** Agent ID */
  agentId?: string;

  /** Agent 闂傚倷绀侀幉锟犳嚌閸撗呯煋闁诡垱澹嬮崣?*/
  agentName?: string;

  /** Agent 婵犵妲呴崑鍡樻櫠濡ゅ啫鍨濋煫鍥ㄦ⒒閻?*/
  agentColor?: string;

  /** Teammate 濠电姷顣藉Σ鍛村垂椤忓牆鐒垫い鎺嗗亾缁剧虎鍘惧☉鐢稿焵?*/
  teammateMode?: 'tmux' | 'in-process' | 'auto';
}

/**
 * tmux Session 闂傚倷鑳剁划顖炩€﹂崼銉ユ槬闁哄稁鍘奸悞? */
export interface TmuxSession {
  /** Session 闂傚倷绀侀幉锟犳嚌閸撗呯煋闁诡垱澹嬮崣?*/
  name: TmuxSessionName;

  /** 闂傚倷绀佸﹢閬嶃€傛禒瀣；闁瑰墽绮崐鍫曟煟閹扮増娑уù鐘崇矒閺岀喓绮甸崷顓犵槇閻庤娲忛崕閬嶎敇婵傜鐐婇柨婵嗘濞呭牓姊婚崒姘偓鎼佸磹娴犲绠垫い蹇撴椤洘绻涢崱妯虹亶闁稿鎹囬幃浠嬪垂椤愩垺鐣紓?-L socket闂?*/
  namespace: string;

  /** Session 婵犵數鍋為崹鍫曞箹閳哄懎鍌ㄩ柟顖嗏偓閺?windows */
  windows: TmuxWindow[];

  /** 闂傚倷绀侀幉锛勬暜濡ゅ啰鐭欓柟瀵稿Х绾句粙鏌熼幑鎰靛殭缂侇偄绉归弻娑㈩敃閿濆棛顦ㄩ梺?*/
  createdAt: string;

  /** 闂傚倷绀侀幖顐も偓姘卞厴瀹曡瀵奸弶鎴犵暰婵炶揪绲藉﹢閬嶅煝閺冣偓缁绘稑顔忛鑽ゅ嚬濡炪倖鎸诲浠嬪蓟?session闂傚倷鐒︾€笛呯矙閹达附鍋嬮煫鍥ㄧ☉閺嬩線鏌曢崼婵囶棤妞?break-pane闂?*/
  hidden?: boolean;
}

/**
 * tmux Window 闂傚倷鑳剁划顖炩€﹂崼銉ユ槬闁哄稁鍘奸悞鍨亜閹达絾纭剁紒娑樼箳缁辨帗娼忛妸褎鍣伴梺纭呭亹閹虫捇锝炲┑瀣垫晣闁绘劙娼х拋鏌ユ⒒娴ｅ憡鎯堥悗姘煎枟閹便劑骞橀钘夊壄闂佺粯顭囩划顖炲疾? */
export interface TmuxWindow {
  /** Window 缂傚倸鍊峰鎺旂矚閸洖鍨傞柛锔诲幗椤?*/
  index: number;

  /** Window 闂傚倷绀侀幉锟犳嚌閸撗呯煋闁诡垱澹嬮崣?*/
  name: string;

  /** 闂備浇顕уù鐑藉极閹间礁绠犻柟鐐劶婵娊鏌＄仦璇插姕闁稿骸绉归弻娑㈠即閵娿儰绨介梺鍝勵槷缁瑥顫?Window ID闂傚倷鐒︾€笛呯矙閹达附鍋嬪┑鐘插亰閼板潡鏌ｅΔ鈧悧鍕濠婂牊鐓曢柨鏃囶嚙楠炴绱掗幇顓ф疁闁哄本鐩獮鍥敆娴ｅ憡鐣婚梻浣侯焾鐎涒晠骞愰幎钘夋瀬?*/
  actualWindowId: string;

  /** Session 闂傚倷绀侀幉锟犳嚌閸撗呯煋闁诡垱澹嬮崣?*/
  sessionName: TmuxSessionName;

  /** 闂傚倷绀侀幖顐も偓姘卞厴瀹曡瀵奸弶鎴犵暰婵炴挻鍩冮崑鎾绘煙?tmux 闂傚倷鑳堕…鍫㈡崲閹烘鍌ㄧ憸鏃堛€佸▎鎾崇疀妞ゆ梻绮崟鍐⒑缁嬫寧婀伴柤褰掔畺閹﹢鏁嶉崟銊ヤ壕闁绘劗鎳撻埀顒佹礋楠炴牠顢曢敂钘夋闂佺粯妫佸▍锝嗙▔瀹ュ鐓ユ繛鎴灻顏堟煕?*/
  managed?: boolean;

  /** 闂傚倷绀侀幖顐も偓姘卞厴瀹曡瀵奸弶鎴犵暰婵炶揪绲藉﹢閬嶅煝閺冣偓缁绘稑顔忛鑽ゅ嚬濡炪倖鎸诲浠嬪蓟?婵犵數鍋為崹鍫曞箰閹间焦鍋ら柕濞垮労濞?window闂傚倷鐒︾€笛呯矙閹达附鍋嬮柛鈩冪◤閳?break-pane 闂備浇顕ф绋匡耿闁秴绠犻柟鐐灱閺嬪秹鏌熼悜姗嗘畷闁?*/
  hidden?: boolean;
}

/**
 * tmux 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵囧闁哥姴妫濋弻銊モ攽閸℃﹩妫ら梺閫炲苯澧伴柡鍜佸亞濡叉劙骞掑Δ鈧粻濠氭倵閻㈠憡娅滈柛?
 */
export interface ParsedTmuxCommand {
  /** 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵囧窛閻忓繒鏁婚幃褰掑炊椤忓嫮姣㈤梺?*/
  command: TmuxCommand;

  /** 闂傚倷鑳堕…鍫㈡崲閸儱绀夌€光偓閸曨剙鍓冲銈嗗笒鐎氼參鎮炵拠宸唵闁兼悂娼ф慨鍌炴煃?*/
  globalOptions: {
    /** -L socket 闂傚倷绀侀幉锟犳偡閵夆晛纾圭憸鐗堝笒濮?*/
    socket?: string;
    /** -f config-file */
    configFile?: string;
    /** -S socket-path */
    socketPath?: string;
    /** -T features */
    features?: string;
    /** -c shell-command */
    shellCommand?: string;
  };

  /** 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵愭Ч闁绘帟顕ч…鍧楁嚋闂堟稑顫囬梺?*/
  options: Record<string, string | boolean | number>;

  /** 婵犵數鍋犻幓顏嗗緤閻ｅ瞼鐭撻柛顐ｆ礃閸嬵亪鏌涢埄鍐槈闁活厽顨婇弻娑氫沪閸撗€濮囧┑?*/
  args: string[];
}

/**
 * split-window 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵愭Ч闁绘帟顕ч…鍧楁嚋闂堟稑顫囬梺? */
export interface SplitWindowOptions {
  /** 闂傚倷鑳堕崕鐢稿疾閳哄懎绐楁俊銈呮噺閸?pane/window (-t) */
  target?: string;

  /** 濠电姵顔栭崰妤勬懌濠电偛鍚嬮悷鈺呭蓟閿曞倸鐓涢柛娑卞幘椤︻偊姊虹化鏇炲⒉妞ゃ劌鎳樿棢?(-h) */
  horizontal?: boolean;

  /** 闂傚倷鐒﹂幃鍫曞礉瀹€鍕９閻犲洩顥嗗ú顏勯敜婵°倐鍋撶紒鈧崱娑欑厱闁斥晛鍠氬▓鏃€銇?(-v) */
  vertical?: boolean;

  /** 婵犵數濮伴崹褰掓偉閵忋倕绀冩い蹇撴噽濡?(-l) */
  size?: string;

  /** 闂傚倷娴囬惃顐﹀礋椤愩垹袘闂備焦鎮堕崝灞绢殽濮濆矈鏆伴梻浣告惈閸婁粙鏁撻妷锔绢洸闁挎繂顦伴崐?*/
  percentage?: number;

  /** 闂傚倷鑳堕幊鎾绘倶濮樿泛绠扮紒瀣硶閺嗐倝鏌涢幇闈涙灈婵?pane ID (-P) */
  print?: boolean;

  /** 闂傚倷绀侀幖顐ょ矓閸洖鍌ㄧ憸蹇撐ｉ幇鐗堟櫢闁绘灏欓ˇ閬嶆⒑閸濆嫮鈻夐柛鎾寸〒缁辨瑦绻濆顓犲幈?(-F) */
  format?: string;

  /** 闂傚倷绀侀幉锟犲礄瑜版帒鍨傞柣妤€鐗婇崣蹇涙煃閸濆嫭鍣圭€瑰憡绻堥弻鐔衡偓娑櫭粭姘攽?*/
  command?: string;
}

/**
 * send-keys 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵愭Ч闁绘帟顕ч…鍧楁嚋闂堟稑顫囬梺? */
export interface SendKeysOptions {
  /** 闂傚倷鑳堕崕鐢稿疾閳哄懎绐楁俊銈呮噺閸?pane (-t) */
  target: string;

  /** 闂傚倷绀佸﹢閬嶁€﹂崼銉嬪洭鎮界粙鎸庣€銈嗘尵閸犳劙宕曢悢鑲╁彄闁搞儯鍔嶇亸顓㈡煟?*/
  keys: string[];

  /** 闂傚倷绀侀幖顐も偓姘卞厴瀹曡瀵奸弶鎴犵暰婵炴挻鍩冮崑鎾垛偓瑙勬礈婵炩偓鐎规洏鍔戦、姗€鎮㈠畡鏉款棐 Enter 闂?*/
  hasEnter: boolean;
}

/**
 * select-layout 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵愭Ч闁绘帟顕ч…鍧楁嚋闂堟稑顫囬梺? */
export interface SelectLayoutOptions {
  /** 闂傚倷鑳堕崕鐢稿疾閳哄懎绐楁俊銈呮噺閸?window (-t) */
  target?: string;

  /** 闂備焦鐪归崺鍕垂娴兼潙鐤い鎰堕檮閸庢垶銇勯幒鎴濐仼閻熸瑱濡囬埀顒€绠嶉崕鍗炩枖?*/
  layout: TmuxLayout;
}

/**
 * resize-pane 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵愭Ч闁绘帟顕ч…鍧楁嚋闂堟稑顫囬梺? */
export interface ResizePaneOptions {
  /** 闂傚倷鑳堕崕鐢稿疾閳哄懎绐楁俊銈呮噺閸?pane (-t) */
  target: string;

  /** 闂備浇顕уù鐑姐€佹繝鍋芥盯宕熼娑樹壕?(-x) */
  width?: string;

  /** 婵犲痉鏉库偓鏇㈠磹瑜版帗鏅梺?(-y) */
  height?: string;

  /** 闂傚倷娴囬惃顐﹀礋椤愩垹袘闂備焦鎮堕崝灞绢殽濮濆矈鏆?*/
  percentage?: number;
}

/**
 * select-pane 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵愭Ч闁绘帟顕ч…鍧楁嚋闂堟稑顫囬梺? */
export interface SelectPaneOptions {
  /** 闂傚倷鑳堕崕鐢稿疾閳哄懎绐楁俊銈呮噺閸?pane (-t) */
  target: string;

  /** 闂備浇宕垫慨宕囩矆娴ｈ娅犲ù鐘差儐閸嬵亪鏌涢埄鍐槈闁告劏鍋撻梻浣规偠閸庢椽宕滈敃鍌氭辈?(-T) */
  title?: string;

  /** 闂備浇宕垫慨宕囩矆娴ｈ娅犲ù鐘差儐閸嬵亪鏌涢埄鍐槈闁告劏鍋撻柣搴ｆ嚀鐎氼厽绔熼崱娆愬厹闁?(-P) */
  style?: string;

  /** 闂傚倷鑳堕崢褔宕崸妤€瀚夋い鎺嗗亾闁宠绉撮埢搴ㄥ箻閺夋垶鐤?*/
  backgroundColor?: string;

  /** 闂傚倷绀侀幉锟犲箰閸濄儳鐭撻梻鍫熺▓閺嬪秵绻涢崱妯诲鞍闁?*/
  foregroundColor?: string;
}

/**
 * set-option 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵愭Ч闁绘帟顕ч…鍧楁嚋闂堟稑顫囬梺? */
export interface SetOptionOptions {
  /** 缂傚倸鍊烽悞锕傚礉閺嶎厹鈧啴宕卞☉娆忎罕闂佸憡绺块崕鍐参涢婊勫枑闁哄啫鐗嗛悞鍨亜閹哄棗浜惧銈忓閺佺粯淇?(-p) */
  pane?: boolean;

  /** 缂傚倸鍊烽悞锕傚礉閺嶎厹鈧啴宕ㄩ懜顑挎睏濠电偞鍨跺銊ノ涢婊勫枑闁哄啫鐗嗛悞鍨亜閹哄棗浜惧銈忓閺佺粯淇?(-w) */
  window?: boolean;

  /** 闂傚倷鑳堕崕鐢稿疾閳哄懎绐楁俊銈呮噺閸?(-t) */
  target?: string;

  /** 闂傚倸鍊风欢锟犲磻閸曨垁鍥偨缁嬭銉р偓骞垮劚椤︻垳鎲撮敂閿亾楠炲灝鍔氭繛?*/
  optionName: string;

  /** 闂傚倸鍊风欢锟犲磻閸曨垁鍥偨缁嬭銉р偓骞垮劚椤︻垳澹?*/
  optionValue: string;
}

/**
 * display-message 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵愭Ч闁绘帟顕ч…鍧楁嚋闂堟稑顫囬梺? */
export interface DisplayMessageOptions {
  /** 闂傚倷鑳堕崕鐢稿疾閳哄懎绐楁俊銈呮噺閸?pane/window (-t) */
  target?: string;

  /** 闂傚倷鑳堕幊鎾绘倶濮樿泛绠扮紒瀣硶閺嗐倝鏌涢幇闈涙灈缂佲偓?stdout (-p) */
  print?: boolean;

  /** 闂傚倷绀侀幖顐ょ矓閸洖鍌ㄧ憸蹇撐ｉ幇鐗堟櫢闁绘灏欓ˇ閬嶆⒑閸濆嫯鐧侀柛娑卞枟閸犳洜绱撻崒娆戝妽妞ゃ劍鍔楃槐鎾愁潩鏉堛劌鏆?*/
  format?: string;
}

/**
 * list-panes 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁狀噣鏌曢崼婵愭Ч闁绘帟顕ч…鍧楁嚋闂堟稑顫囬梺? */
export interface ListPanesOptions {
  /** 闂傚倷鑳堕崕鐢稿疾閳哄懎绐楁俊銈呮噺閸?window (-t) */
  target?: string;

  /** 闂傚倷绀侀幖顐ょ矓閸洖鍌ㄧ憸蹇撐ｉ幇鐗堟櫢闁绘灏欓ˇ閬嶆⒑閸濆嫮鈻夐柛鎾寸〒缁辨瑦绻濆顓犲幈?(-F) */
  format?: string;
}

/**
 * TmuxCompatService 闂傚倷娴囬～澶嬬娴犲纾块弶鍫亖娴? * 婵犵數鍋為崹鍫曞箰鐠囧弬锝夊箳閺冣偓瀹曞弶淇婇婵嗕汗闁活厽鐟╅幃妤呮晲閸屾稒鐝楅梺鍛婏供閸撶喖寮?tmux 闂傚倷鑳堕…鍫㈡崲閹烘鍌ㄧ憸鏃堛€佸▎鎾崇疀闁哄鐏濋悵姗€鎮楅獮鍨姎闁瑰啿閰ｉ敐? */
export interface ITmuxCompatService {
  /**
   * 闂傚倷绀佸﹢閬嶆偡閹惰棄骞㈤柍鍝勫€归弶?tmux 闂傚倷绀侀幉锛勭矙閹烘鍨傛繝闈涱儏缁?   */
  executeCommand(request: TmuxCommandRequest): Promise<TmuxCommandResponse>;

  /**
   * 闂傚倷绀侀幉锛勬暜閹烘嚦娑樷攽鐎ｎ亜鍋嶉梺闈涚墕椤︻垰螞濮椻偓閺岀喎鈻撻崹顔界亶闂?tmux pane ID
   */
  allocatePaneId(): TmuxPaneId;

  /**
   * 闂傚倸鍊风欢锟犲磻閸涱喚鈹嶉柧蹇氼潐瀹?tmux pane ID 闂傚倷绀侀幖顐ゆ偖椤愶箑纾块柛娆忣槺閻濊埖淇婇姘辨癁闁稿鎹囧畷鐑筋敇閻愮増顫曟繝纰夌磿閾忓酣宕归崼鏇炵畾?window ID 闂?pane ID
   */
  resolvePaneId(tmuxPaneId: TmuxPaneId): { windowId: string; paneId: string } | null;

  /**
   * 闂傚倸鍊风欢锟犲磻閸涱喚鈹嶉柧蹇氼潐瀹?window target 闂備浇宕甸崰鎰版偡鏉堚晛绶ゅΔ锝呭暞閸?window ID
   */
  resolveWindowTarget(target: TmuxWindowTarget, namespace?: string): string | null;

  /**
   * 濠电姷鏁搁崑娑⑺囬銏犵鐎光偓閸曨偉鍩?pane ID 闂傚倷绀侀幖顐も偓姘煎枟閹便劑骞橀钘夊壄?   */
  registerPane(tmuxPaneId: TmuxPaneId, windowId: string, paneId: string): void;

  /**
   * 濠电姷鏁搁崑娑⑺囬銏犵闁硅揪绠戠紒?pane ID 闂傚倷绀侀幖顐も偓姘煎枟閹便劑骞橀钘夊壄?   */
  unregisterPane(tmuxPaneId: TmuxPaneId): void;

  /**
   * 闂傚倷绀侀崥瀣磿閹惰棄搴婇柤鑹扮堪娴滃綊鏌涢妷顔煎缂佺媴缍侀弻鈥崇暤椤旂厧鏆熷ù鐙€鍙冮幃?session
   */
  getOrCreateSession(sessionName: TmuxSessionName, namespace: string): TmuxSession;

  /**
   * 闂傚倷绀侀崥瀣磿閹惰棄搴婇柤鑹扮堪娴?tmux pane ID闂傚倷鐒︾€笛呯矙閹达附鍋嬮柟鎹愵嚙閻掑灚銇勯幒宥嗩樂濞存嚎鍨荤槐鎺旀嫚閹绘帗娈婚悗瑙勬礃閿曘垹鐣烽妸鈺佺骇闁瑰瓨绻傝 pane ID闂?   */
  getTmuxPaneId(windowId: string, paneId: string): TmuxPaneId | undefined;

  /**
   * ???? window ? tmux RPC server ????????? socket ??
   */
  ensureRpcServer(windowId: string): Promise<string>;

  /**
   * ???? window ? tmux RPC socket ??
   */
  getRpcSocketPath(windowId: string): string;

  /**
   * 闂傚倸鍊风粈浣鸿姳闁秴纾婚柟鎯х摠閸欏繘鏌ㄥ┑鍡楊伀闁告柨绉电换婵嬪焵椤掑嫬鐐婃い鎺嗗亾缂佲偓?   */
  destroy(): void;
}

/**
 * RPC 闂傚倸鍊风欢锟犲磻閸涘瓨鍎楁い鏃傛櫕閳瑰秴鈹戦悩鍙夋悙缁绢厸鍋撻梻濠庡亜濞诧箓宕欒ぐ鎺戣埞闁圭虎鍠楅悡銉︾箾閹寸倖鎴犳濠曨晱m <-> 婵犵數鍋為崹鍫曞箰鐠囧弬锝夊箳閺冣偓瀹曞弶淇婇婵嗕汗闁活厽鐟╅幃妤呮晲閸涱収鏆㈢紓浣插亾? */
export interface TmuxRpcMessage {
  /** 濠电姷鏁搁崑鐐哄垂閻㈠憡鍋嬪┑鐘插暙椤曢亶鏌涘☉鍗炵仯閻忓繒鏁婚幃褰掑炊椤忓嫮姣㈤梺?*/
  type: 'request' | 'response';

  /** 闂備浇宕垫慨鏉懨洪銏犵哗闂侇剙绉甸崕?ID闂傚倷鐒︾€笛呯矙閹达附鍋嬮煫鍥ㄧ☉閺嬩線鏌曢崼婵囶棤妞も晜鐓￠獮鏍垝閸忓浜剧€规洖娲ら悡鍐⒒閸屾瑧鍔嶆繝銏☆焽缁棃鎮滅粵瀣櫔濡炪倖宸婚崑鎾诲极閸儲鐓曢悘鐐插⒔椤ｆ煡鎮楀顓犲弨闁哄本绋戦埞鎴﹀幢濞呮亽鍨荤槐鎺楀Ω閿旀儳寮ㄩ梺?*/
  requestId: string;

  /** 闂備浇宕垫慨鏉懨洪銏犵哗闂侇剙绉甸崕鎴澝归崗鍏肩稇闁哄绶氶弻锝呂旈埀顒勬偋閸℃瑧鐭?*/
  request?: TmuxCommandRequest;

  /** 闂傚倷绀侀幉锛勬崲閸屾粎鐭撻悗鍨摃婵娊鏌＄仦璇插姎闁哄绶氶弻锝呂旈埀顒勬偋閸℃瑧鐭?*/
  response?: TmuxCommandResponse;

  /** 闂傚倸鍊烽悞锔锯偓绗涘洦鍋￠柕濞炬櫓閺佸鏌曢崼婵囶棤闁崇懓绉归弻宥夊煛娴ｅ憡娈ㄧ紓?*/
  error?: string;
}

/**
 * 闂傚倷鑳剁划顖滃垝閻樿鍨傚ù鍏肩暘閳ь剙鍊挎俊鎼佸煛娴ｈ櫣鍘繝娈垮枟閵囨盯宕戦幘缁樼厱闁挎繂鎳忛幆鍫ユ煃缂佹ɑ顥堝┑鈩冩倐婵＄兘濡烽妷锕佺发闂備浇宕甸崰鎰版偡閵壯€鍋撳鐓庣仯闁? */
export interface TmuxEnvironmentVariables {
  /** 缂傚倸鍊烽悞锕傚礉閺嶎厹鈧啴宕ㄩ懜顑挎睏?ID */
  AUSOME_TERMINAL_WINDOW_ID: string;

  /** Pane ID */
  AUSOME_TERMINAL_PANE_ID: string;

  /** tmux RPC 闂傚倸鍊风欢锟犲磻閸涱厾鏆嗛柛娑橈功椤╂彃螖閿濆懎鏆為柡鍜佸墴閺屾稖顧侀柡瀣┎ed pipe 闂?socket 闂備浇宕垫慨宕囨媰閿曞倸鍨傞柟娈垮枟椤愪粙鏌ｉ幇顔煎妺闁?*/
  AUSOME_TMUX_RPC: string;

  /** 濠电姷顣藉Σ鍛村垂椤忓牆绀堟繝闈涚墐閸?TMUX 闂傚倷鑳剁划顖滃垝閻樿鍨傚ù鍏肩暘閳ь剙鍊挎俊鎼佸煛娴ｈ櫣鍘繝娈垮枟閵囨盯宕戦幘缁樼厱闁挎繂妫欓妵婵嬫煛娴ｅ摜效鐎规洖銈搁弫鎰償閳╁啯娈?Claude 闂備浇宕垫慨鎶芥⒔瀹ュ纾归柟鎹愬煐鐎氬鏌ｉ弮鍌氬付闁?tmux 婵犵數鍋為崹鍫曞箹閳哄懎鐭楅煫鍥ㄦ礃椤?*/
  TMUX: string;

  /** 濠电姷顣藉Σ鍛村垂椤忓牆绀堟繝闈涚墐閸?TMUX_PANE 闂傚倷鑳剁划顖滃垝閻樿鍨傚ù鍏肩暘閳ь剙鍊挎俊鎼佸煛娴ｈ櫣鍘繝娈垮枟閵囨盯宕戦幘缁樼厱?*/
  TMUX_PANE: TmuxPaneId;
}

/**
 * 闂備焦鐪归崺鍕垂娴兼潙鐤い鎰堕檮閸庢垶銇勯幒鎴濐仼缂佺姾鍋愰埀顒€绠嶉崕杈┾偓姘煎枤缁瑦绻濋崶銊у幍闂佽鍘界敮鎺楀礉濮樿鲸鍠愰柣妤€鐗忓ú鎾煛娴ｅ摜效鐎规洜鍘ч…銊╁川閹殿喚顔?TmuxCompatService 闂備浇宕垫慨鎾敄閸涙潙鐤ù鍏兼綑閺嬩線鏌曢崼婵愭Ч闁? */
export interface ILayoutOperations {
  /**
   * 闂備礁婀遍崢褔鎮洪妸銉綎濠电姵鑹鹃弸?main-vertical 闂備焦鐪归崺鍕垂娴兼潙鐤い鎰堕檮閸?   */
  applyMainVerticalLayout(windowId: string): Promise<void>;

  /**
   * 闂備礁婀遍崢褔鎮洪妸銉綎濠电姵鑹鹃弸?tiled 闂備焦鐪归崺鍕垂娴兼潙鐤い鎰堕檮閸?   */
  applyTiledLayout(windowId: string): Promise<void>;

  /**
   * 闂備浇宕垫慨鎾敄閸涙潙鐤い鏍仜濮?pane 婵犵數濮伴崹褰掓偉閵忋倕绀冩い蹇撴噽濡叉姊绘担鐟邦嚋缂佸鍨块幃褑绠涢幘顖涚€洪梺闈浥堥弲娑氱矆閸℃稒鐓曢柍鈺佸枤閻掕姤淇婇懠顒€鍘撮柡?   */
  resizePaneToRatio(windowId: string, paneId: string, widthRatio?: number, heightRatio?: number): Promise<void>;

  /**
   * 缂傚倸鍊风粈渚€藝閹剁瓔鏁嬬憸搴ㄥ箞?pane 闂傚倷绀侀幉锛勬暜濡や胶鐝堕柛鈩冾樅閻戞ê顕遍柡澶嬪灥閸炪劑姊洪幖鐐插姷濠碘€虫川缁梻鈧潧鎽滅壕?   */
  movePane(windowId: string, paneId: string, targetGroup: string): Promise<void>;
}
