/* ============================================================
 * 全站 Wiki 侧边栏 v8.3
 *
 * 树形规则:
 * - ★ 数据加载后立即统一规范化 URL(目录式 → /dir/index.html)
 *   文件夹里的 index.html 严格作为该文件夹的父级分组头,
 *   同级其他 .html 与子文件夹全部是它的子级(递归,无限深度)
 * - 没有 index.html 的文件夹:内容上提一级,保证不丢页面
 *
 * 隐藏页面(两种方式):
 * 1. 下方 EXCLUDE 正则数组(渲染前过滤,不受缓存影响,推荐)
 * 2. 页面 <head> 加 <meta name="sb_hidden" content="1">
 *    (爬虫解析时过滤;受 5 分钟缓存影响,改后需 SiteSidebar.clearCache())
 *
 * 数据来源:Pagefind 多策略 → 纯 JS 爬虫兜底
 * 爬虫:sitemap.xml 种子 + 首页链接遍历 + EXTRA_SEEDS 手动种子
 * 支持 .html / 目录式(/dir/) / 无扩展名链接
 *
 * 分组头交互:单击展开/收起(220ms 双击识别)/ 双击、右键打开
 *
 * ★ v8.3 变更:
 * - 「小工具」卡片与「专业搜索」「返回上页」完全等大
 *   (统一 padding/margin/line-height,emoji 缩小防止撑高)
 * - 「小工具」展开/收起带 max-height + opacity 过渡动画
 *   (修复了此前 hidden 被 display:flex 覆盖导致收起不消失的 bug)
 * - TOOLS 支持 action:"random" → 真正可用的「随机页面」
 *   (从站点索引随机挑一页跳转,自动排除当前页)
 *
 * 调试:console.table(__sbPages) / console.table(__sbGroups)
 * ============================================================ */

(function () {
  const VERSION = "v8.3";
  const SB_W_FULL = 250;
  const SB_GAP = 16;
  const RECENT_COUNT = 4;
  const HISTORY_COUNT = 5;
  const MAX_RESULTS = 800;
  const CRAWL_CACHE_KEY = "sb_crawl_cache_v3"; // ★ v3:键升级,旧缓存自动作废
  const CRAWL_TTL = 5 * 60 * 1000;
  const DBL_CLICK_MS = 220;
  const MQ = window.matchMedia("(max-width: 850px)");
  const isMobile = () => MQ.matches;

  // 若需要 sb_hidden 在 Pagefind 路径下也生效,设为 true(总是用爬虫)
  const FORCE_CRAWLER = false;

  // ============================================================
  // ★ 隐藏页面方式一:正则匹配站内路径(渲染前过滤,刷新即生效)
  // ============================================================
  const EXCLUDE = [
    /\/404\.html$/i,
    /\/cs\.html$/i, // 搜索页(不需要可删除此行)
    // /\/navigation_bar\//i, // 例:隐藏整个文件夹
    // /\/draft\//i,
  ];

  // ★ 手动种子:爬虫发现不了的页面(相对站根路径),按需增删
  const EXTRA_SEEDS = [
    // "/character/index.html",
    // "/navigation_bar/index.html",
  ];

  // ============================================================
  // ★ 小工具:配置区
  //   - 普通链接:{ href: "/xxx.html", text: "名称" }
  //   - 随机页面:{ text: "随机页面", action: "random" }
  // ============================================================
  const TOOLS = [
    { text: "随机页面", action: "random" },
    { href: "#", text: "正在开发" },
    // { href: "/tools/xxx.html", text: "更多工具" },
  ];

  console.info("[sidebar] " + VERSION + " 已加载(index.html 严格作父级;EXCLUDE 渲染前过滤)");

  // ============================================================
  // 0. 站点前缀探测 + Pagefind 加载
  // ============================================================
  let BASE = "";
  const P = p => BASE + p;

  async function loadPagefind() {
    if (window.SITE_BASE) {
      BASE = window.SITE_BASE.replace(/\/+$/, "");
    } else {
      const candidates = [""];
      const firstSeg = location.pathname.split("/").filter(Boolean)[0];
      if (firstSeg) candidates.push("/" + firstSeg);
      for (const seg of candidates) {
        try {
          const res = await fetch(seg + "/pagefind/pagefind-entry.json", { cache: "no-store" });
          if (!res.ok) throw 0;
          BASE = seg;
          break;
        } catch (e) {}
      }
    }
    await fetch(P("/pagefind/pagefind-entry.json"), { cache: "reload" }).catch(() => {});
    const mod = await import(P("/pagefind/pagefind.js") + "?v=" + Date.now());
    if (BASE) {
      try { await mod.options({ basePath: P("/pagefind/") }); } catch (e) {}
    }
    console.info("[sidebar] 站点前缀 =", BASE ? '"' + BASE + '"' : "(根路径)");
    return mod;
  }

  // ============================================================
  // 1. DOM 骨架
  // ============================================================
  const sidebar = document.createElement("aside");
  sidebar.id = "siteSidebar";
  sidebar.className = "site-sidebar";
  sidebar.setAttribute("data-pagefind-ignore", "");

  sidebar.innerHTML = `
    <div class="sb-head">
      <img src="/image/logo.png" alt="" class="sb-logo">
      <span class="sb-title">劳埃德大师 Wiki</span>
    </div>
        <a class="sb-back" id="sbBack" href="javascript:void(0)">
      <span class="sb-back-ico">←</span><span class="sb-text">返回上页</span>
    </a>
    <a class="sb-search" href="/search.html">
      <span class="sb-search-ico"></span><span class="sb-text">专业搜索</span>
    </a>
    <!-- ★ 小工具折叠菜单 -->
    <div class="sb-tools" id="sbTools">
      <button class="sb-tools-toggle" id="sbToolsToggle" type="button">
        <span class="sb-tools-ico">🛠</span>
        <span class="sb-text">小工具</span>
        <span class="sb-tools-arrow" id="sbToolsArrow">▸</span>
      </button>
      <div class="sb-tools-list" id="sbToolsList"></div>
    </div>
    <nav class="sb-nav" id="sbNav"></nav>
    <div class="sb-history-wrap" id="sbHistoryWrap">
      <span class="sb-group-title" id="sbHistoryTitle">历史上的今天</span>
      <nav class="sb-history" id="sbHistory"></nav>
    </div>
    <div class="sb-toc-wrap" id="sbTocWrap" hidden>
      <span class="sb-group-title">本页目录</span>
      <nav class="sb-toc" id="sbToc"></nav>
    </div>
    <div class="sb-recent-wrap" id="sbRecentWrap" hidden>
      <span class="sb-group-title">最近更新</span>
      <nav class="sb-recent" id="sbRecent"></nav>
    </div>
  `;

  const logoEl = sidebar.querySelector(".sb-logo");
  const searchEl = sidebar.querySelector(".sb-search");
  const navEl = sidebar.querySelector("#sbNav");

  function titleOf(d) {
    if (d.meta && d.meta.title && d.meta.title.trim()) return d.meta.title.trim();
    const seg = (d.url || "").replace(/\/+$/, "").split("/").pop() || "未命名页面";
    return decodeURIComponent(seg);
  }

  // ============================================================
  // 2. URL 规范化(全链路统一口径)
  //    /dir/、/dir、/dir/index.html → 全部统一为 /dir/index.html
  // ============================================================
  function toCanonical(p) {
    let q = (p || "").replace(/\/+$/, "");
    if (!q) return "/index.html";
    if (!/\.html?$/i.test(q)) q += "/index.html";
    try { q = decodeURIComponent(q); } catch (e) {}
    return q;
  }
  function normalizeUrl(u) { return toCanonical(u); }
  function isActive(href) { return toCanonical(P(href)) === toCanonical(location.pathname); }

  // ============================================================
  // 3. 树构建 + 渲染
  // ============================================================
  const INDEX_RE = /^index\.html?$/i;

  // ---- 第一步:按路径挂成目录树(输入已全部规范化) ----
  function buildTree(pages) {
    const root = { dirs: new Map(), files: [] };
    pages.forEach(d => {
      if (EXCLUDE.some(re => re.test(d.url))) return;
      const url = toCanonical(d.url);
      const parts = url.split("/").filter(Boolean);
      const file = parts.pop();
      let node = root;
      parts.forEach(seg => {
        if (!node.dirs.has(seg)) node.dirs.set(seg, { dirs: new Map(), files: [] });
        node = node.dirs.get(seg);
      });
      node.files.push({ file, url, title: titleOf(d) });
    });
    return root;
  }

  function dedupeChildren(children) {
    const seen = new Set();
    return children.filter(c => {
      const k = toCanonical(c.href);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // ---- 第二步:目录树 → 分组数组 ----
  // ★ 文件夹有 index.html → 它是父级,同级文件+子文件夹全为子级(递归)
  function toGroups(node) {
    const out = [];
    const used = new Set();
    const pushOnce = item => {
      const k = toCanonical(item.href);
      if (used.has(k)) return;
      used.add(k);
      out.push(item);
    };
    node.dirs.forEach(sub => {
      const idx = sub.files.find(f => INDEX_RE.test(f.file));
      if (idx) {
        pushOnce({
          href: idx.url,
          text: idx.title,
          children: dedupeChildren([
            ...sub.files.filter(f => !INDEX_RE.test(f.file))
              .map(f => ({ href: f.url, text: f.title })),
            ...toGroups(sub),
          ]),
        });
      } else {
        // 没有 index.html 的文件夹:内容上提一级,保证不丢页面
        sub.files.forEach(f => pushOnce({ href: f.url, text: f.title }));
        toGroups(sub).forEach(pushOnce);
      }
    });
    // 当前目录的散文件(根目录 index.html 是站点首页,不重复列出)
    node.files.filter(f => !INDEX_RE.test(f.file))
      .forEach(f => pushOnce({ href: f.url, text: f.title }));
    return out;
  }

  // ---- 第三步:渲染 ----
  function isActiveDeep(g) {
    return isActive(g.href) || (g.children || []).some(isActiveDeep);
  }

  function renderNav(groups) {
    navEl.innerHTML = "";
    if (!groups || !groups.length) {
      navEl.hidden = true;
      return;
    }
    navEl.hidden = false;
    const makeLeaf = g => {
      const a = document.createElement("a");
      a.href = P(toCanonical(g.href));
      a.className = "sb-link";
      a.innerHTML = `<span class="sb-ico"></span><span class="sb-text"></span>`;
      a.querySelector(".sb-text").textContent = g.text;
      if (isActive(g.href)) a.classList.add("active");
      return a;
    };
    const makeGroup = g => {
      const details = document.createElement("details");
      details.className = "sb-node";
      if (isActiveDeep(g)) details.open = true;
      const summary = document.createElement("summary");
      summary.className = "sb-node-summary";
      summary.title = "单击展开/收起 · 双击或右键打开页面";
      const arrow = document.createElement("span");
      arrow.className = "sb-arrow";
      arrow.textContent = "▸";
      const label = document.createElement("span");
      label.className = "sb-link";
      label.innerHTML = `<span class="sb-ico"></span><span class="sb-text"></span>`;
      label.querySelector(".sb-text").textContent = g.text;
      if (isActive(g.href)) label.classList.add("active");
      summary.append(arrow, label);
      // 单击展开(延迟识别双击)/ 双击、右键打开
      let clickTimer = null;
      const openPage = e => {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        e.preventDefault();
        e.stopPropagation();
        location.href = P(toCanonical(g.href));
      };
      summary.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
          openPage(e);
        } else {
          clickTimer = setTimeout(() => {
            clickTimer = null;
            details.open = !details.open;
          }, DBL_CLICK_MS);
        }
      });
      summary.addEventListener("dblclick", openPage);
      summary.addEventListener("contextmenu", openPage);
      details.appendChild(summary);
      const cw = document.createElement("div");
      cw.className = "sb-children";
      g.children.forEach(c => cw.appendChild(c.children ? makeGroup(c) : makeLeaf(c)));
      details.appendChild(cw);
      return details;
    };
    groups.forEach(g => navEl.appendChild(g.children ? makeGroup(g) : makeLeaf(g)));
  }

  // ============================================================
  // 4. 全量加载页面
  // ============================================================
  async function tryPagefind(pagefind) {
    const seen = new Set();
    const datas = [];
    const baseOpts = BASE ? { basePath: P("/pagefind/") } : null;
    const addResults = async (results) => {
      const chunk = await Promise.all(results.slice(0, MAX_RESULTS).map(async r => {
        try { return await r.data(); } catch (e) { return null; }
      }));
      chunk.forEach(d => {
        if (d && d.url && !seen.has(d.url)) {
          seen.add(d.url);
          datas.push(d);
        }
      });
    };
    let langs = [];
    try {
      const entry = await (await fetch(P("/pagefind/pagefind-entry.json"), { cache: "no-store" })).json();
      langs = Object.keys(entry.languages || {});
    } catch (e) {}
    const strategies = [
      { label: "全库空搜索", opts: baseOpts, q: "" },
      ...langs.map(l => ({ label: "语言 " + l, opts: Object.assign({ language: l }, baseOpts || {}), q: "" })),
      { label: "空格", opts: baseOpts, q: " " },
      { label: "通配符", opts: baseOpts, q: "*" },
    ];
    for (const st of strategies) {
      if (datas.length) break;
      try {
        if (st.opts) await pagefind.options(st.opts);
        const s = await pagefind.search(st.q);
        console.info("[sidebar] Pagefind 策略[" + st.label + "] → " + s.results.length + " 条");
        if (s.results.length) await addResults(s.results);
      } catch (e) {
        console.warn("[sidebar] Pagefind 策略[" + st.label + "] 失败:", (e && e.message) || e);
      }
    }
    return datas;
  }

  function parsePage(text, path) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    if (!doc.querySelector("html")) return null;
    // ★ 隐藏方式二:<meta name="sb_hidden" content="1"> → 不进树
    if (doc.querySelector('meta[name="sb_hidden"]')?.content === "1") return null;
    let title = "";
    const tEl = doc.querySelector('[data-pagefind-meta*="title"]');
    if (tEl) title = tEl.textContent.trim();
    if (!title) {
      const h1 = doc.querySelector("h1");
      if (h1) title = h1.textContent.trim();
    }
    if (!title) {
      title = decodeURIComponent(path.replace(/\/+$/, "").split("/").pop() || "未命名页面");
    }
    let date = "";
    const dEl = doc.querySelector('[data-pagefind-meta*="date"]');
    if (dEl) {
      const m = (dEl.getAttribute("data-pagefind-meta") || "").match(/date:\s*(\d{4}-\d{2}-\d{2})/);
      if (m) date = m[1];
    }
    // 存储时即规范化,后续全链路统一
    return { url: toCanonical(path), meta: { title, date } };
  }

  // 链接收集:.html / 目录式 / 无扩展名均可
  function collectLinks(doc, fromPath) {
    const out = new Set();
    doc.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) return;
      let u;
      try { u = new URL(href, location.origin + fromPath); } catch (e) { return; }
      if (u.origin !== location.origin) return;
      let p;
      try { p = decodeURIComponent(u.pathname); } catch (e) { return; }
      if (p.startsWith("/pagefind/")) return;
      const isHtml = /\.html?$/i.test(p);
      const isDir = p.endsWith("/");
      const isExtless = !/\.[a-zA-Z0-9]+$/.test(p);
      if (!isHtml && !isDir && !isExtless) return;
      out.add(toCanonical(p));
    });
    return out;
  }

  async function crawlAllPages() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CRAWL_CACHE_KEY) || "null");
      if (cached && Date.now() - cached.t < CRAWL_TTL && cached.pages.length) {
        console.info("[sidebar] 爬虫结果使用缓存(" + cached.pages.length + " 页," + Math.round((Date.now() - cached.t) / 1000) + "s 前生成;SiteSidebar.clearCache() 可强制刷新)");
        return cached.pages;
      }
    } catch (e) {}
    const seen = new Set();
    const queue = [];
    const pages = [];
    const enqueue = p => {
      const c = toCanonical(p);
      if (!seen.has(c)) { seen.add(c); queue.push(c); }
    };
    // 种子 1:sitemap.xml(目录式 loc 也接受)
    try {
      const res = await fetch(P("/sitemap.xml"), { cache: "no-store" });
      if (res.ok) {
        const txt = await res.text();
        const doc = new DOMParser().parseFromString(txt, "application/xml");
        doc.querySelectorAll("loc").forEach(loc => {
          let u;
          try { u = new URL(loc.textContent.trim()); } catch (e) { return; }
          if (u.origin !== location.origin) return;
          let p;
          try { p = decodeURIComponent(u.pathname); } catch (e) { return; }
          if (p.startsWith("/pagefind/")) return;
          if (/\.html?$/i.test(p) || p.endsWith("/") || !/\.[a-zA-Z0-9]+$/.test(p)) {
            enqueue(p);
          }
        });
        console.info("[sidebar] sitemap.xml 提供 " + queue.length + " 个种子页面");
      }
    } catch (e) {}
    // 种子 2:首页
    enqueue(P("/index.html"));
    // 种子 3:手动追加
    EXTRA_SEEDS.forEach(s => enqueue(P(s)));
    if (EXTRA_SEEDS.length) console.info("[sidebar] EXTRA_SEEDS 追加 " + EXTRA_SEEDS.length + " 个种子");
    while (queue.length && pages.length < MAX_RESULTS) {
      const path = queue.shift();
      let res, text;
      try {
        res = await fetch(path, { cache: "no-store" });
        if (!res.ok) continue;
        text = await res.text();
      } catch (e) { continue; }
      const d = parsePage(text, path);
      if (d) pages.push(d);
      collectLinks(new DOMParser().parseFromString(text, "text/html"), path)
        .forEach(enqueue);
    }
    console.info("[sidebar] 爬虫完成:共 " + pages.length + " 页");
    try {
      sessionStorage.setItem(CRAWL_CACHE_KEY, JSON.stringify({ t: Date.now(), pages }));
    } catch (e) {}
    return pages;
  }

  async function loadAllPages(pagefind) {
    let datas;
    if (FORCE_CRAWLER) {
      console.info("[sidebar] 已强制使用纯 JS 爬虫");
      datas = await crawlAllPages();
    } else {
      datas = await tryPagefind(pagefind);
      if (!datas.length) {
        console.info("[sidebar] Pagefind 枚举不可用,切换到纯 JS 爬虫…");
        datas = await crawlAllPages();
      }
    }
    // ★ 立即统一规范化 + 去重(/dir/ 与 /dir/index.html 必然合并)
    const seenMap = new Map();
    datas.forEach(d => {
      const k = toCanonical(d.url);
      if (k && !seenMap.has(k)) seenMap.set(k, Object.assign({}, d, { url: k }));
    });
    const result = [...seenMap.values()];
    if (result.length !== datas.length) {
      console.warn("[sidebar] 规范化去重:" + datas.length + " → " + result.length + " 页");
    }
    return result;
  }

  // ★ 保存"数据加载完成"的 Promise,供小工具(随机页面)等使用
  //   resolve 值 = 过滤 EXCLUDE 后的全量页面数组
  const pagesReady = loadPagefind()
    .then(async (pagefind) => {
      let datas = await loadAllPages(pagefind);
      // ★ EXCLUDE 渲染前统一过滤(两条数据路径都生效,刷新即生效)
      datas = datas.filter(d => !EXCLUDE.some(re => re.test(d.url)));
      console.info("[sidebar] 索引共 " + datas.length + " 页");
      window.__sbPages = datas; // 调试:确认后可删
      const groups = toGroups(buildTree(datas));
      window.__sbGroups = groups; // 调试:确认后可删
      renderNav(groups);
      if (!navEl.querySelector("a.sb-link")) {
        console.warn("[sidebar] 索引有数据但没有生成任何分组");
      }
      logoEl.src = P("/image/logo.png");
      searchEl.href = P("/search.html");
      const dated = datas.map(d => ({
        url: d.url,
        title: titleOf(d),
        date: ((d.meta && d.meta.date) || "").trim(),
      })).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date))
        .filter(d => !EXCLUDE.some(re => re.test(d.url)));
      console.info("[sidebar] 带有效日期的页面 " + dated.length + " 个");
      if (document.body.getAttribute("data-sidebar-recent") !== "off") {
        const recent = [...dated].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_COUNT);
        if (recent.length) {
          const el = sidebar.querySelector("#sbRecent");
          sidebar.querySelector("#sbRecentWrap").hidden = false;
          recent.forEach(d => {
            const a = document.createElement("a");
            a.href = P(toCanonical(d.url));
            a.className = "sb-recent-link";
            a.innerHTML = `<span class="sb-recent-title"></span><span class="sb-recent-date"></span>`;
            a.querySelector(".sb-recent-title").textContent = d.title;
            a.querySelector(".sb-recent-date").textContent = d.date.slice(5);
            el.appendChild(a);
          });
        }
      }
      if (document.body.getAttribute("data-sidebar-history") !== "off") {
        const now = new Date();
        const md = String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
        const hits = dated.filter(d => d.date.slice(5) === md).sort((a, b) => b.date.localeCompare(a.date));
        const limited = hits.slice(0, HISTORY_COUNT);
        sidebar.querySelector("#sbHistoryTitle").textContent = "历史上的今天 · " + md.replace("-", "/");
        const el = sidebar.querySelector("#sbHistory");
        el.innerHTML = "";
        if (limited.length) {
          limited.forEach(d => {
            const a = document.createElement("a");
            a.href = P(toCanonical(d.url));
            a.className = "sb-history-link";
            a.innerHTML = `<span class="sb-history-title"></span><span class="sb-history-year"></span>`;
            a.querySelector(".sb-history-title").textContent = d.title;
            a.querySelector(".sb-history-year").textContent = d.date.slice(0, 4);
            el.appendChild(a);
          });
        } else {
          const p = document.createElement("span");
          p.className = "sb-history-empty";
          p.textContent = "暂无";
          el.appendChild(p);
        }
      }
      // ★ 返回数据,让 pagesReady 能拿到页面列表
      return datas;
    })
    .catch(e => {
      console.error("[sidebar] 加载失败:", e);
      renderNav([]);
      return []; // ★ 失败时返回空数组,随机页面可据此提示
    });

  // ============================================================
  // ★ 6.5 小工具折叠菜单(展开/收起 + 随机页面)
  // ============================================================
  (function () {
    const toggle = sidebar.querySelector("#sbToolsToggle");
    const list = sidebar.querySelector("#sbToolsList");
    const arrow = sidebar.querySelector("#sbToolsArrow");

    if (!toggle || !list || !arrow) return;

    // ---- ★ 随机页面:从站点索引中随机挑一页跳转 ----
    async function gotoRandomPage(linkEl) {
      // 数据可能还在加载中,等待 pagesReady(最多等 10 秒)
      const datas = await Promise.race([
        pagesReady,
        new Promise(res => setTimeout(() => res([]), 10000)),
      ]);
      const cur = toCanonical(location.pathname);
      const pool = datas.filter(d => toCanonical(d.url) !== cur);
      if (!pool.length) {
        console.warn("[sidebar] 随机页面:没有可跳转的页面(索引为空或仍在加载)");
        if (linkEl) {
          const span = linkEl.querySelector(".sb-text");
          const old = span.textContent;
          span.textContent = "暂无可选页面";
          setTimeout(() => { span.textContent = old; }, 1500);
        }
        return;
      }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      console.info("[sidebar] 随机跳转 → " + pick.url);
      location.href = P(pick.url);
    }

    // ---- 渲染工具项 ----
    TOOLS.forEach(t => {
      if (t.action === "random") {
        // 随机页面:行为按钮(不是普通链接)
        const a = document.createElement("a");
        a.href = "javascript:void(0)";
        a.className = "sb-tools-link";
        a.innerHTML = `<span class="sb-ico"></span><span class="sb-text"></span>`;
        a.querySelector(".sb-text").textContent = t.text;
        a.addEventListener("click", e => {
          e.preventDefault();
          if (isMobile()) closeSidebar();
          gotoRandomPage(a);
        });
        list.appendChild(a);
      } else {
        // 普通链接工具
        const a = document.createElement("a");
        a.href = P(toCanonical(t.href));
        a.className = "sb-tools-link";
        a.innerHTML = `<span class="sb-ico"></span><span class="sb-text"></span>`;
        a.querySelector(".sb-text").textContent = t.text;
        if (isActive(t.href)) a.classList.add("active");
        a.addEventListener("click", () => { if (isMobile()) closeSidebar(); });
        list.appendChild(a);
      }
    });

    // ---- 展开/收起(★ 用 class + max-height 过渡动画,不用 hidden) ----
    toggle.addEventListener("click", () => {
      const isOpen = toggle.classList.toggle("expanded");
      list.classList.toggle("open", isOpen);
      arrow.classList.toggle("open", isOpen);
    });
  })();

  // ============================================================
  // 5. 本页目录(优先 .toc,回退 h2/h3)
  // ============================================================
  if (document.body.getAttribute("data-sidebar-toc") !== "off") {
    const toc = sidebar.querySelector("#sbToc");
    const tocWrap = sidebar.querySelector("#sbTocWrap");
    const entries = [];
    const pageToc = document.querySelector(".toc");
    if (pageToc) {
      pageToc.querySelectorAll('a[href^="#"]').forEach(a => {
        const id = decodeURIComponent(a.getAttribute("href").slice(1));
        const target = document.getElementById(id);
        if (target) entries.push({ a, target, text: a.textContent.trim() });
      });
    }
    if (!entries.length) {
      document.querySelectorAll("main h2[id], main h3[id], article h2[id], article h3[id]")
        .forEach(h => entries.push({ a: null, target: h, text: h.textContent.trim() }));
    }
    if (entries.length >= 2) {
      tocWrap.hidden = false;
      toc.innerHTML = "";
      function getDepth(el) {
        let d = 0, p = el.closest("li");
        while (p) { d++; p = p.parentElement.closest("li"); }
        return d - 1;
      }
      entries.forEach(({ a, target, text }) => {
        const link = document.createElement("a");
        link.className = "sb-toc-link";
        link.href = "#" + target.id;
        link.textContent = text;
        const depth = a ? (a.closest("ul") ? getDepth(a) : 0) : (target.tagName === "H3" ? 1 : 0);
        if (depth > 0) link.classList.add("sub");
        link.addEventListener("click", () => { if (isMobile()) closeSidebar(); });
        toc.appendChild(link);
      });
      const links = toc.querySelectorAll(".sb-toc-link");
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) links.forEach(l => l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id));
      }), { rootMargin: "-20% 0px -70% 0px" });
      entries.forEach(({ target }) => io.observe(target));
    }
  }

  // ============================================================
  // 6. 返回上页
  // ============================================================
  sidebar.querySelector("#sbBack").addEventListener("click", e => {
    e.preventDefault();
    if (isMobile()) closeSidebar();
    if (!document.referrer && history.length <= 1) {
      location.href = P("/index.html");
    } else {
      history.back();
    }
  });

  // ============================================================
  // 7. 开关逻辑
  // ============================================================
  const overlay = document.createElement("div");
  overlay.id = "sbOverlay";
  overlay.className = "sb-overlay";
  overlay.setAttribute("data-pagefind-ignore", "");

  function updateSidebarTop() {
    const navbar = document.querySelector(".navbar");
    if (isMobile() && navbar) {
      sidebar.style.top = navbar.offsetHeight + "px";
    } else {
      sidebar.style.top = "";
    }
  }
  function openSidebar() {
    updateSidebarTop();
    sidebar.classList.add("open");
    if (isMobile()) {
      overlay.classList.add("show");
    } else {
      document.body.style.paddingLeft = (SB_W_FULL + SB_GAP) + "px";
    }
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
    document.body.style.paddingLeft = "";
  }
  function toggleSidebar() {
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  }
  const trig = document.getElementById("sidebarTrigger");
  if (trig) trig.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    toggleSidebar();
  });
  overlay.addEventListener("click", closeSidebar);
  MQ.addEventListener("change", () => closeSidebar());
  window.addEventListener("resize", () => {
    if (sidebar.classList.contains("open")) updateSidebarTop();
  });
  document.body.prepend(sidebar, overlay);

  window.SiteSidebar = {
    open: openSidebar,
    close: closeSidebar,
    toggle: toggleSidebar,
    clearCache() {
      sessionStorage.removeItem(CRAWL_CACHE_KEY);
      console.info("[sidebar] 爬虫缓存已清除");
    },
    // ★ 顺便暴露一个 API,方便以后外部调用随机跳转
    randomPage() {
      const randomLink = [...sidebar.querySelectorAll(".sb-tools-link")]
        .find(a => a.dataset.toolAction === "random");
      if (randomLink) randomLink.click();
    },
  };

  // ============================================================
  // 8. 完整样式(内嵌,多级嵌套缩进)
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    :root {
      --sb-placeholder: "#";
      --sb-placeholder-color: #9db4c8;
      --sb-search-icon: url("data:image/svg+xml,%3Csvg width='18' height='18' viewBox='0 0 18 18' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12.7549 11.255H11.9649L11.6849 10.985C12.6649 9.845 13.2549 8.365 13.2549 6.755C13.2549 3.165 10.3449 0.255005 6.75488 0.255005C3.16488 0.255005 0.254883 3.165 0.254883 6.755C0.254883 10.345 3.16488 13.255 6.75488 13.255C8.36488 13.255 9.84488 12.665 10.9849 11.685L11.2549 11.965V12.755L16.2549 17.745L17.7449 16.255L12.7549 11.255ZM6.75488 11.255C4.26488 11.255 2.25488 9.245 2.25488 6.755C2.25488 4.26501 4.26488 2.255 6.75488 2.255C9.24488 2.255 11.2549 4.26501 11.2549 6.755C11.2549 9.245 9.24488 11.255 6.75488 11.255Z' fill='%23000000'/%3E%3C/svg%3E%0A");
    }

    .site-sidebar {
      position: fixed;
      top: var(--nav-height, 64px);
      left: 0;
      bottom: 0;
      width: ${SB_W_FULL}px;
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-right: 1px solid var(--border);
      padding: 14px 12px 24px;
      overflow-y: auto;
      overflow-x: hidden;
      z-index: 1500;
      transform: translateX(-100%);
      transition: transform .25s cubic-bezier(.4, 0, .2, 1), box-shadow .25s cubic-bezier(.4, 0, .2, 1);
      box-shadow: none;
      scrollbar-width: thin;
    }
    .site-sidebar.open {
      transform: translateX(0);
      box-shadow: 4px 0 20px rgba(0,0,0,.1);
    }
    .site-sidebar::-webkit-scrollbar { width: 5px; }
    .site-sidebar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }

    .sb-head {
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
      margin-bottom: 10px;
    }
    .sb-logo {
      width: 32px; height: 32px;
      border-radius: 6px;
      flex-shrink: 0;
      border: none;
      margin: 0;
    }
    .sb-title { font-weight: 700; font-size: 0.95rem; white-space: nowrap; }

    /* ---- 专业搜索 / 返回上页 / 小工具:三卡统一尺寸基准 ----
       共同规格:margin 6px 0 / padding 8px 12px / border-radius 10px
                 font-size 0.88rem / line-height 1.2 / 图标宽 15px */

    .sb-search {
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      margin: 6px 0;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      text-decoration: none;
      font-size: 0.88rem;
      line-height: 1.2;
      white-space: nowrap;
      transition: border-color .2s, color .2s;
    }
    .sb-search:hover { border-color: var(--primary); color: var(--primary); text-decoration: none; }
    .sb-search-ico {
      display: inline-block;
      width: 15px; height: 15px;
      flex-shrink: 0;
      background-color: currentColor;
      opacity: .7;
      -webkit-mask-image: var(--sb-search-icon);
      mask-image: var(--sb-search-icon);
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-size: contain;
      mask-size: contain;
      -webkit-mask-position: center;
      mask-position: center;
      transition: opacity .2s;
    }
    .sb-search:hover .sb-search-ico { opacity: 1; }

    .sb-back {
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      margin: 6px 0;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      text-decoration: none;
      font-size: 0.88rem;
      line-height: 1.2;
      white-space: nowrap;
      transition: border-color .2s, color .2s;
    }
    .sb-back:hover { border-color: var(--primary); color: var(--primary); text-decoration: none; }
    .sb-back-ico { font-weight: 700; width: 15px; flex-shrink: 0; text-align: center; opacity: .7; }
    .sb-back:hover .sb-back-ico { opacity: 1; }

    /* ★ 小工具卡片(与 sb-search / sb-back 完全等大) */
    .sb-tools { margin: 0; }
    .sb-tools-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      box-sizing: border-box;
      margin: 6px 0;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: transparent;
      color: var(--text);
      font-size: 0.88rem;
      line-height: 1.2;
      cursor: pointer;
      white-space: nowrap;
      transition: border-color .2s, color .2s, background .15s;
      font-family: inherit;
      -webkit-appearance: none;
      appearance: none;
    }
    .sb-tools-toggle:hover { border-color: var(--primary); color: var(--primary); }
    .sb-tools-toggle.expanded {
      background: color-mix(in srgb, var(--primary) 8%, transparent);
      border-color: var(--primary);
    }
    .sb-tools-ico {
      width: 15px;
      text-align: center;
      opacity: .7;
      flex-shrink: 0;
      font-size: 0.85rem;   /* ★ 缩小 emoji,防止撑高卡片 */
      line-height: 1;
    }
    .sb-tools-toggle .sb-text { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; }
    .sb-tools-arrow {
      font-size: 0.7rem;
      opacity: .5;
      flex-shrink: 0;
      transition: transform .25s cubic-bezier(.4, 0, .2, 1);
    }
    .sb-tools-arrow.open { transform: rotate(90deg); }

    /* ★ 工具列表:用 max-height + opacity 过渡动画展开/收起
         (不用 hidden,避免被 display:flex 覆盖导致收起不消失) */
    .sb-tools-list {
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      margin-left: 10px;
      padding-left: 6px;
      border-left: 2px solid transparent;
      transform: translateY(-4px);
      transition:
        max-height .3s cubic-bezier(.4, 0, .2, 1),
        opacity .22s ease,
        transform .22s ease,
        border-color .3s ease,
        margin-top .3s ease;
    }
    .sb-tools-list.open {
      max-height: 400px;    /* 展开上限,工具过多时请调大 */
      opacity: 1;
      transform: translateY(0);
      border-left-color: var(--border);
      margin-top: 4px;
    }
    .sb-tools-link {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: var(--border-radius);
      color: var(--text);
      text-decoration: none;
      font-size: 0.85rem;
      white-space: nowrap;
      overflow: hidden;
      transition: background .15s, color .15s;
    }
    .sb-tools-link:hover {
      background: color-mix(in srgb, var(--primary) 10%, transparent);
      text-decoration: none;
    }
    .sb-tools-link.active {
      background: var(--primary);
      color: #fff;
      font-weight: 600;
    }

    .sb-group-title {
      display: block;
      font-size: 0.72rem;
      font-weight: 600;
      opacity: .55;
      text-transform: uppercase;
      letter-spacing: .05em;
      margin: 16px 0 6px;
      padding: 0 8px;
      white-space: nowrap;
    }
    .sb-nav { margin-top: 4px; }
    .sb-node { margin: 1px 0; }
    .sb-node > summary {
      list-style: none;
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      padding-right: 4px;
      border-radius: var(--border-radius);
    }
    .sb-node > summary::-webkit-details-marker { display: none; }
    .sb-node > summary .sb-link { cursor: pointer; }
    .sb-arrow { font-size: 0.7rem; opacity: .5; width: 14px; flex-shrink: 0; transition: transform .2s; text-align: center; }
    .sb-node[open] > summary .sb-arrow { transform: rotate(90deg); }

    .sb-link {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 8px;
      border-radius: var(--border-radius);
      color: var(--text);
      text-decoration: none;
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      transition: background .15s, color .15s;
    }
    .sb-link:hover { background: color-mix(in srgb, var(--primary) 10%, transparent); text-decoration: none; }
    .sb-link.active { background: var(--primary); color: #fff; font-weight: 600; }

    /* 多级嵌套缩进(最深 4 层) */
    .sb-children .sb-node > summary .sb-link { font-size: 0.86rem; }
    .sb-children .sb-children .sb-node > summary .sb-link { font-size: 0.83rem; }
    .sb-children .sb-children .sb-children .sb-node > summary .sb-link { font-size: 0.8rem; }
    .sb-children .sb-link { padding-left: 26px; }
    .sb-children .sb-children .sb-link { padding-left: 38px; }
    .sb-children .sb-children .sb-children .sb-link { padding-left: 50px; }

    .sb-text { overflow: hidden; text-overflow: ellipsis; }
    .sb-ico {
      display: inline-block;
      width: 16px;
      flex-shrink: 0;
      color: var(--sb-placeholder-color);
      opacity: .45;
      font-weight: 600;
      text-align: center;
    }
    .sb-ico::before { content: var(--sb-placeholder); }
    .sb-ico:not(:empty)::before { content: none; }

    .sb-link.reserved { opacity: .45; }
    .sb-link.reserved::after { content: " 🔒"; font-size: 0.7rem; }

    .sb-toc-wrap, .sb-recent-wrap, .sb-history-wrap {
      border-top: 1px solid var(--border);
      margin-top: 14px;
      padding-top: 2px;
    }
    .sb-toc-link {
      display: block;
      padding: 5px 8px;
      border-left: 2px solid transparent;
      color: var(--text);
      text-decoration: none;
      font-size: 0.82rem;
      opacity: .8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: border-color .2s, color .2s;
    }
    .sb-toc-link:hover { text-decoration: none; opacity: 1; }
    .sb-toc-link.sub { padding-left: 20px; font-size: 0.78rem; }
    .sb-toc-link.active { border-left-color: var(--primary); color: var(--primary); opacity: 1; font-weight: 600; }

    .sb-recent-link, .sb-history-link {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      padding: 5px 8px;
      border-radius: var(--border-radius);
      color: var(--text);
      text-decoration: none;
      white-space: nowrap;
    }
    .sb-recent-link:hover, .sb-history-link:hover {
      background: color-mix(in srgb, var(--primary) 8%, transparent);
      text-decoration: none;
    }
    .sb-recent-title, .sb-history-title { font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; }
    .sb-recent-date { font-size: 0.72rem; opacity: .55; flex-shrink: 0; }
    .sb-history-year {
      font-size: 0.7rem;
      flex-shrink: 0;
      background: color-mix(in srgb, var(--primary) 12%, transparent);
      color: var(--primary);
      border-radius: 4px;
      padding: 1px 6px;
      font-weight: 600;
    }
    .sb-history-empty { display: block; padding: 5px 8px; font-size: 0.8rem; opacity: .45; }

    body {
      transition: background-color 0.2s, color 0.2s, padding-left .25s cubic-bezier(.4, 0, .2, 1) !important;
    }
    .sb-trigger { cursor: pointer; display: inline-flex; border-radius: 8px; }
    .sb-trigger img { transition: transform .15s ease; }
    .sb-trigger:hover img { transform: scale(1.04); }
    .sb-trigger:active img { transform: scale(0.97); }

    .sb-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.4);
      z-index: 1499;
    }
    .sb-overlay.show { display: block; }

    @media (max-width: 850px) {
      .sb-overlay { background: rgba(0,0,0,.22); }
      .site-sidebar {
        background-color: var(--bg);
        background-image: linear-gradient(var(--card-bg), var(--card-bg));
        transform: translateX(-100%);
      }
      .site-sidebar.open { transform: translateX(0); }
    }
  `;
  document.head.appendChild(style);
})();
