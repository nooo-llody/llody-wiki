/* ============================================================
 * 全站 Wiki 侧边栏 v9.2(混合加载 + 树排序)
 *
 * 加载策略:
 * 1. Pagefind 索引先渲染(毫秒级首屏)
 * 2. 同时后台启动纯 JS 爬虫(fetch 各页实时解析)
 * 3. 爬虫完成后合并:爬虫数据覆盖同 URL 的索引数据,
 *    索引独有的页面保留(直到爬虫确认它已删除)
 * 4. 合并前后 URL 集合一致则不重渲染(保留展开/高亮状态)
 *
 * 树形规则:
 * - URL 统一规范化为 /dir/index.html
 * - 文件夹里的 index.html 严格作为父级分组头(递归,无限深度)
 * - 没有 index.html 的文件夹:内容上提一级
 * - 只有 index.html、无其他内容的分组自动降级为叶子
 *
 * ★ v9.2 排序规则:
 * - 同级内「有子级的分组在前,无子级的叶子在后」
 * - 各自内部按标题首字母排序(中文按拼音,localeCompare zh-Hans-CN)
 * - 递归应用于每一层
 *
 * 隐藏/排除页面:
 * 1. EXCLUDE 正则(刷新即生效)
 * 2. <html data-pagefind-ignore>:
 *    - 索引路径:Pagefind 天然不收录
 *    - 爬虫路径:整页跳过,不进树、不采集其链接
 * 3. <meta name="sb_hidden" content="1">(爬虫实时生效;
 *    索引路径需 data-pagefind-filter 属性并重建索引)
 *    ★ 两种写法都要求英文直引号
 *
 * 调试:console.table(__sbPages) / console.table(__sbGroups)
 * ============================================================ */

(function () {
  const VERSION = "v9.2";
  const SB_W_FULL = 250;
  const SB_GAP = 16;
  const RECENT_COUNT = 4;
  const HISTORY_COUNT = 5;
  const MAX_RESULTS = 800;
  const CRAWL_CACHE_KEY = "sb_crawl_cache_v3";
  const CRAWL_TTL = 5 * 60 * 1000;
  const DBL_CLICK_MS = 220;
  const MQ = window.matchMedia("(max-width: 850px)");
  const isMobile = () => MQ.matches;

  // true = 只用爬虫(完全实时,不用索引)
  // false = 混合模式:索引首屏 + 爬虫后台校正(推荐)
  const FORCE_CRAWLER = false;

  // ============================================================
  // ★ 隐藏页面方式一:正则匹配站内路径
  // ============================================================
  const EXCLUDE = [
    /\/404\.html$/i,
    /\/cs\.html$/i,
    // /\/navigation_bar\//i,
  ];

  const EXTRA_SEEDS = [
    // "/character/index.html",
  ];

  // ============================================================
  // 小工具配置区
  // ============================================================
  const TOOLS = [
    { text: "随机页面", action: "random" },
    { href: "#", text: "正在开发" },
  ];

  console.info("[sidebar] " + VERSION + " 已加载(混合模式)");

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
    <div class="sb-tools" id="sbTools">
      <button class="sb-tools-toggle" id="sbToolsToggle" type="button">
        <span class="sb-tools-ico">🛠</span>
        <span class="sb-text">小工具</span>
        <span class="sb-tools-arrow" id="sbToolsArrow">▸</span>
      </button>
      <div class="sb-tools-list" id="sbToolsList"></div>
    </div>
    <nav class="sb-nav" id="sbNav"></nav>
    <div class="sb-loading" id="sbLoading">
      <div class="sb-loading-row">
        <span class="sb-spinner"></span>
        <span class="sb-loading-text">索引加载中…</span>
      </div>
      <div class="sb-skeleton"></div>
      <div class="sb-skeleton"></div>
      <div class="sb-skeleton"></div>
    </div>
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

  function setLoading(msg, isError) {
    const el = sidebar.querySelector("#sbLoading");
    if (!el) return;
    if (!msg) { el.remove(); return; }
    el.innerHTML = `<div class="sb-loading-row"><span class="sb-loading-text${isError ? " error" : ""}"></span></div>`;
    el.querySelector(".sb-loading-text").textContent = msg;
  }

  // ============================================================
  // 2. URL 规范化 + 标题
  // ============================================================
  function toCanonical(p) {
    let q = (p || "").replace(/\/+$/, "");
    if (!q) return "/index.html";
    if (!/\.html?$/i.test(q)) q += "/index.html";
    try { q = decodeURIComponent(q); } catch (e) {}
    return q;
  }
  function isActive(href) { return toCanonical(P(href)) === toCanonical(location.pathname); }

  function normalizePagefindUrl(raw) {
    let u = String(raw || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) {
      try { u = new URL(u).pathname; } catch (e) { return ""; }
    }
    u = u.split("#")[0].split("?")[0];
    if (u === "." || u === "./") return "/index.html";
    if (!u.startsWith("/")) u = "/" + u;
    try { u = decodeURIComponent(u); } catch (e) {}
    return toCanonical(u);
  }

  function titleOf(d) {
    if (d.meta && d.meta.title && d.meta.title.trim()) return d.meta.title.trim();
    const seg = (d.url || "").replace(/\/+$/, "").split("/").pop() || "未命名页面";
    return decodeURIComponent(seg).replace(/\.html?$/i, "") || "未命名页面";
  }

  // ★ 统一隐藏判断(EXCLUDE + 索引 filter)
  function isHidden(d) {
    if (EXCLUDE.some(re => re.test(d.url || ""))) return true;
    const fv = d.filters && d.filters.sb_hidden;
    if (fv === "1" || fv === true) return true;
    if (Array.isArray(fv) && fv.includes("1")) return true;
    return false;
  }

  // ============================================================
  // 3. 树构建 + 排序 + 渲染
  // ============================================================
  const INDEX_RE = /^index\.html?$/i;

  function buildTree(pages) {
    const root = { dirs: new Map(), files: [] };
    pages.forEach(d => {
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
        sub.files.forEach(f => pushOnce({ href: f.url, text: f.title }));
        toGroups(sub).forEach(pushOnce);
      }
    });
    node.files.filter(f => !INDEX_RE.test(f.file))
      .forEach(f => pushOnce({ href: f.url, text: f.title }));
    return out;
  }

  // ============================================================
  // ★ v9.2 树排序:同级「有子级在前,无子级在后」,各自按首字母
  //   中文标题按拼音排序(localeCompare zh-Hans-CN)
  // ============================================================
  function hasChildren(g) {
    return !!(g.children && g.children.length);
  }

  function sortGroups(groups) {
    if (!Array.isArray(groups)) return groups;
    const cmp = (a, b) =>
      String(a.text || "").localeCompare(String(b.text || ""), "zh-Hans-CN", { numeric: true });
    const sorted = [...groups].sort((a, b) => {
      const ga = hasChildren(a) ? 1 : 0;
      const gb = hasChildren(b) ? 1 : 0;
      if (ga !== gb) return gb - ga; // 有子级的分组排前面
      return cmp(a, b);              // 同类内部按首字母/拼音
    });
    // 递归应用到每一层的子级
    sorted.forEach(g => {
      if (hasChildren(g)) g.children = sortGroups(g.children);
    });
    return sorted;
  }

  function isActiveDeep(g) {
    return isActive(g.href) || (g.children || []).some(isActiveDeep);
  }

  function animateDetails(details, open) {
    const wrap = details.querySelector(":scope > .sb-children-wrap");
    if (!wrap) { details.open = open; return; }
    if (open) {
      details.open = true;
      requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("open")));
    } else {
      wrap.classList.remove("open");
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        wrap.removeEventListener("transitionend", onEnd);
        if (!wrap.classList.contains("open")) details.open = false;
      };
      const onEnd = e => { if (e.propertyName === "grid-template-rows") finish(); };
      wrap.addEventListener("transitionend", onEnd);
      setTimeout(finish, 220);
    }
  }

  function renderNav(groups) {
    navEl.innerHTML = "";
    if (!groups || !groups.length) {
      navEl.hidden = true;
      return;
    }
    navEl.hidden = false;
    // ★ v9.2:渲染前统一排序(含所有子级)
    const sorted = sortGroups(groups);
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
      const summary = document.createElement("summary");
      summary.className = "sb-node-summary";
      summary.title = "单击展开/收起   双击或右键打开页面";
      const arrow = document.createElement("span");
      arrow.className = "sb-arrow";
      arrow.textContent = "▸";
      const label = document.createElement("span");
      label.className = "sb-link";
      label.innerHTML = `<span class="sb-ico"></span><span class="sb-text"></span>`;
      label.querySelector(".sb-text").textContent = g.text;
      if (isActive(g.href)) label.classList.add("active");
      summary.append(arrow, label);

      const wrap = document.createElement("div");
      wrap.className = "sb-children-wrap";
      const cw = document.createElement("div");
      cw.className = "sb-children";
      g.children.forEach(c => cw.appendChild(hasChildren(c) ? makeGroup(c) : makeLeaf(c)));
      wrap.appendChild(cw);
      details.appendChild(summary);
      details.appendChild(wrap);

      if (isActiveDeep(g)) {
        details.open = true;
        wrap.classList.add("open");
      }

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
            animateDetails(details, !details.open || !wrap.classList.contains("open"));
          }, DBL_CLICK_MS);
        }
      });
      summary.addEventListener("dblclick", openPage);
      summary.addEventListener("contextmenu", openPage);
      return details;
    };
    sorted.forEach(g => navEl.appendChild(hasChildren(g) ? makeGroup(g) : makeLeaf(g)));
  }

  // ============================================================
  // 4. 渲染入口(树 + 最近更新 + 历史上的今天,可重复调用)
  // ============================================================
  function renderAll(datas) {
    window.__sbPages = datas;
    const groups = toGroups(buildTree(datas));
    window.__sbGroups = sortGroups(groups);
    renderNav(groups);

    const dated = datas.map(d => ({
      url: d.url,
      title: titleOf(d),
      date: ((d.meta && d.meta.date) || "").trim(),
    })).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date));

    if (document.body.getAttribute("data-sidebar-recent") !== "off") {
      const recent = [...dated].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_COUNT);
      const wrap = sidebar.querySelector("#sbRecentWrap");
      const el = sidebar.querySelector("#sbRecent");
      el.innerHTML = "";
      if (recent.length) {
        wrap.hidden = false;
        recent.forEach(d => {
          const a = document.createElement("a");
          a.href = P(toCanonical(d.url));
          a.className = "sb-recent-link";
          a.innerHTML = `<span class="sb-recent-title"></span><span class="sb-recent-date"></span>`;
          a.querySelector(".sb-recent-title").textContent = d.title;
          a.querySelector(".sb-recent-date").textContent = d.date.slice(5);
          el.appendChild(a);
        });
      } else {
        wrap.hidden = true;
      }
    }

    if (document.body.getAttribute("data-sidebar-history") !== "off") {
      const now = new Date();
      const md = String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
      const hits = dated.filter(d => d.date.slice(5) === md).sort((a, b) => b.date.localeCompare(a.date));
      const limited = hits.slice(0, HISTORY_COUNT);
      sidebar.querySelector("#sbHistoryTitle").textContent = "历史上的今天   " + md.replace("-", "/");
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
  }

  // ============================================================
  // 5. 数据路径一:Pagefind 索引
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
        if (!d) return;
        const url = normalizePagefindUrl(d.url);
        if (!url || seen.has(url)) return;
        const item = Object.assign({}, d, { url });
        if (isHidden(item)) return;
        seen.add(url);
        datas.push(item);
      });
    };
    try {
      if (baseOpts) await pagefind.options(baseOpts);
      // 枚举全库必须 search(null)
      const s = await pagefind.search(null);
      console.info("[sidebar] Pagefind 索引 → " + s.results.length + " 条");
      if (s.results.length) await addResults(s.results);
    } catch (e) {
      console.warn("[sidebar] Pagefind 枚举失败:", (e && e.message) || e);
    }
    return datas;
  }

  // ============================================================
  // 6. 数据路径二:纯 JS 爬虫(实时)
  // ============================================================

  // <html data-pagefind-ignore> 的页面在爬虫路径下也整页排除
  function isIgnoredDoc(doc) {
    return !!(doc.documentElement && doc.documentElement.hasAttribute("data-pagefind-ignore"));
  }

  function parsePage(doc, path) {
    const metaPlain = doc.querySelector('meta[name="sb_hidden"]');
    if (metaPlain && metaPlain.getAttribute("content") === "1") return null;
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
    return { url: toCanonical(path), meta: { title, date } };
  }

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
        console.info("[sidebar] 爬虫结果使用缓存(" + cached.pages.length + " 页;SiteSidebar.clearCache() 可强制刷新)");
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
    enqueue(P("/index.html"));
    EXTRA_SEEDS.forEach(s => enqueue(P(s)));
    while (queue.length && pages.length < MAX_RESULTS) {
      const path = queue.shift();
      let res, text;
      try {
        res = await fetch(path, { cache: "no-store" });
        if (!res.ok) continue;
        text = await res.text();
      } catch (e) { continue; }
      const doc = new DOMParser().parseFromString(text, "text/html");
      if (!doc.querySelector("html")) continue;
      // <html data-pagefind-ignore> → 不进树,也不采集其链接
      if (isIgnoredDoc(doc)) {
        console.info("[sidebar] 已跳过(data-pagefind-ignore):", path);
        continue;
      }
      const d = parsePage(doc, path);
      if (d) pages.push(d);
      collectLinks(doc, path).forEach(enqueue);
    }
    console.info("[sidebar] 爬虫完成:共 " + pages.length + " 页");
    try {
      sessionStorage.setItem(CRAWL_CACHE_KEY, JSON.stringify({ t: Date.now(), pages }));
    } catch (e) {}
    return pages;
  }

  // ============================================================
  // 7. 混合加载主流程
  // ============================================================
  let currentDatas = [];

  function mergeDatas(indexDatas, crawlDatas) {
    const map = new Map();
    (indexDatas || []).forEach(d => {
      if (isHidden(d)) return;
      map.set(toCanonical(d.url), Object.assign({}, d, { url: toCanonical(d.url) }));
    });
    (crawlDatas || []).forEach(d => {
      if (isHidden(d)) return;
      map.set(toCanonical(d.url), Object.assign({}, d, { url: toCanonical(d.url) }));
    });
    return [...map.values()];
  }

  function urlKeySet(datas) {
    return new Set(datas.map(d => toCanonical(d.url)));
  }

  function sameUrlSet(a, b) {
    const ka = urlKeySet(a), kb = urlKeySet(b);
    if (ka.size !== kb.size) return false;
    for (const k of ka) if (!kb.has(k)) return false;
    return true;
  }

  const baseReady = loadPagefind();

  if (FORCE_CRAWLER) {
    baseReady
      .then(() => crawlAllPages())
      .then(datas => {
        currentDatas = mergeDatas([], datas);
        console.info("[sidebar] 索引共 " + currentDatas.length + " 页(纯爬虫)");
        renderAll(currentDatas);
        setLoading();
        logoEl.src = P("/image/logo.png");
        searchEl.href = P("/search.html");
      })
      .catch(e => {
        console.error("[sidebar] 加载失败:", e);
        setLoading("索引加载失败,请刷新重试", true);
      });
  } else {
    const indexPromise = baseReady.then(pf => tryPagefind(pf));
    const crawlPromise = baseReady
      .then(() => crawlAllPages())
      .catch(e => {
        console.warn("[sidebar] 爬虫失败,保持索引数据:", (e && e.message) || e);
        return null;
      });

    indexPromise
      .then(datas => {
        currentDatas = datas;
        console.info("[sidebar] 索引首屏:" + datas.length + " 页(等待爬虫校正…)");
        renderAll(datas);
        setLoading();
        logoEl.src = P("/image/logo.png");
        searchEl.href = P("/search.html");
      })
      .catch(e => {
        console.error("[sidebar] 索引加载失败:", e);
        setLoading("索引加载失败,请刷新重试", true);
      });

    crawlPromise.then(crawlDatas => {
      if (!crawlDatas) return;
      const merged = mergeDatas(currentDatas, crawlDatas);
      if (sameUrlSet(merged, currentDatas)) {
        console.info("[sidebar] 爬虫校正:URL 集合与索引一致,跳过重渲染(" + merged.length + " 页)");
      } else {
        const added = merged.filter(d => !urlKeySet(currentDatas).has(toCanonical(d.url)));
        const removed = currentDatas.filter(d => !urlKeySet(merged).has(toCanonical(d.url)));
        console.info(
          "[sidebar] 爬虫校正:重渲染(" + merged.length + " 页;" +
          "新增 " + added.length + ":[" + added.map(d => d.url).join(", ") + "]" +
          " 移除 " + removed.length + ":[" + removed.map(d => d.url).join(", ") + "])"
        );
        currentDatas = merged;
        renderAll(merged);
      }
    });
  }

  const pagesReady = new Promise(res => {
    const check = () => {
      if (currentDatas.length || !sidebar.querySelector("#sbLoading")) res(currentDatas);
      else setTimeout(check, 150);
    };
    check();
  });

  // ============================================================
  // 8. 小工具折叠菜单
  // ============================================================
  (function () {
    const toggle = sidebar.querySelector("#sbToolsToggle");
    const list = sidebar.querySelector("#sbToolsList");
    const arrow = sidebar.querySelector("#sbToolsArrow");
    if (!toggle || !list || !arrow) return;

    async function gotoRandomPage(linkEl) {
      const span = linkEl ? linkEl.querySelector(".sb-text") : null;
      const oldText = span ? span.textContent : "";
      if (span) span.textContent = "跳转中…";
      const datas = await Promise.race([
        pagesReady,
        new Promise(res => setTimeout(() => res([]), 10000)),
      ]);
      const cur = toCanonical(location.pathname);
      const pool = datas.filter(d => toCanonical(d.url) !== cur);
      if (!pool.length) {
        if (span) {
          span.textContent = "暂无可选页面";
          setTimeout(() => { span.textContent = oldText; }, 1500);
        }
        return;
      }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      console.info("[sidebar] 随机跳转 → " + pick.url);
      location.href = P(pick.url);
    }

    TOOLS.forEach(t => {
      const a = document.createElement("a");
      a.className = "sb-tools-link";
      a.innerHTML = `<span class="sb-ico"></span><span class="sb-text"></span>`;
      a.querySelector(".sb-text").textContent = t.text;
      if (t.action === "random") {
        a.href = "javascript:void(0)";
        a.dataset.toolAction = "random";
        a.addEventListener("click", e => {
          e.preventDefault();
          if (isMobile()) closeSidebar();
          gotoRandomPage(a);
        });
      } else if (t.href === "#") {
        a.href = "javascript:void(0)";
        a.classList.add("placeholder");
        a.addEventListener("click", e => e.preventDefault());
      } else {
        a.href = P(toCanonical(t.href));
        if (isActive(t.href)) a.classList.add("active");
        a.addEventListener("click", () => { if (isMobile()) closeSidebar(); });
      }
      list.appendChild(a);
    });

    toggle.addEventListener("click", () => {
      const isOpen = toggle.classList.toggle("expanded");
      list.classList.toggle("open", isOpen);
      arrow.classList.toggle("open", isOpen);
    });
  })();

  // ============================================================
  // 9. 本页目录
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
  // 10. 返回上页
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
  // 11. 开关逻辑
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
    randomPage() {
      const randomLink = [...sidebar.querySelectorAll(".sb-tools-link")]
        .find(a => a.dataset.toolAction === "random");
      if (randomLink) randomLink.click();
    },
  };

  // ============================================================
  // 12. 完整样式
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    :root {
      --sb-placeholder: "#";
      --sb-placeholder-color: #9db4c8;
      --sb-tree-line: color-mix(in srgb, var(--border) 90%, transparent);
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
      transition: transform .15s cubic-bezier(.4, 0, .2, 1), box-shadow .15s cubic-bezier(.4, 0, .2, 1);
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
      transition: border-color .15s, color .15s;
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
      transition: opacity .15s;
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
      transition: border-color .15s, color .15s;
    }
    .sb-back:hover { border-color: var(--primary); color: var(--primary); text-decoration: none; }
    .sb-back-ico { font-weight: 700; width: 15px; flex-shrink: 0; text-align: center; opacity: .7; }
    .sb-back:hover .sb-back-ico { opacity: 1; }

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
      transition: border-color .15s, color .15s, background .15s;
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
      font-size: 0.85rem;
      line-height: 1;
    }
    .sb-tools-toggle .sb-text { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; }
    .sb-tools-arrow {
      font-size: 0.7rem;
      opacity: .5;
      flex-shrink: 0;
      transition: transform .15s cubic-bezier(.4, 0, .2, 1);
    }
    .sb-tools-arrow.open { transform: rotate(90deg); }

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
        max-height .18s cubic-bezier(.4, 0, .2, 1),
        opacity .14s ease,
        transform .14s ease,
        border-color .18s ease,
        margin-top .18s ease;
    }
    .sb-tools-list.open {
      max-height: 400px;
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
    .sb-tools-link.placeholder { opacity: .4; }

    .sb-loading {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 8px 6px;
    }
    .sb-loading-row { display: flex; align-items: center; gap: 10px; }
    .sb-spinner {
      width: 16px; height: 16px;
      flex-shrink: 0;
      border: 2px solid color-mix(in srgb, var(--primary) 25%, transparent);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: sbSpin .8s linear infinite;
    }
    @keyframes sbSpin { to { transform: rotate(360deg); } }
    .sb-loading-text {
      font-size: 0.82rem;
      opacity: .6;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sb-loading-text.error { color: #d9534f; opacity: 1; }
    .sb-skeleton {
      height: 12px;
      border-radius: 6px;
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--border) 55%, transparent) 25%,
        color-mix(in srgb, var(--border) 100%, transparent) 50%,
        color-mix(in srgb, var(--border) 55%, transparent) 75%
      );
      background-size: 200% 100%;
      animation: sbShimmer 1.2s linear infinite;
    }
    .sb-loading .sb-skeleton:nth-of-type(2) { width: 85%; }
    .sb-loading .sb-skeleton:nth-of-type(3) { width: 70%; }
    .sb-loading .sb-skeleton:nth-of-type(4) { width: 55%; }
    @keyframes sbShimmer {
      from { background-position: 200% 0; }
      to   { background-position: -200% 0; }
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
      position: relative;
    }
    .sb-node > summary::-webkit-details-marker { display: none; }
    .sb-arrow {
      font-size: 0.7rem;
      opacity: .5;
      width: 14px;
      flex-shrink: 0;
      text-align: center;
      transition: transform .15s cubic-bezier(.4, 0, .2, 1);
    }
    .sb-node.open > summary .sb-arrow,
    .sb-node[open] > summary .sb-arrow { transform: rotate(90deg); }

    .sb-children-wrap {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows .16s cubic-bezier(.4, 0, .2, 1);
    }
    .sb-children-wrap.open { grid-template-rows: 1fr; }
    .sb-children {
      overflow: hidden;
      min-height: 0;
      position: relative;
      margin-left: 13px;
      padding-left: 10px;
    }
    .sb-children::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--sb-tree-line);
    }
    .sb-children > a.sb-link,
    .sb-children > .sb-node > summary {
      position: relative;
    }
    .sb-children > a.sb-link::before,
    .sb-children > .sb-node > summary::before {
      content: "";
      position: absolute;
      left: -10px;
      top: 50%;
      width: 10px;
      height: 1px;
      background: var(--sb-tree-line);
      transform: translateY(-50%);
    }

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

    .sb-children .sb-node > summary .sb-link { font-size: 0.86rem; }
    .sb-children .sb-children .sb-node > summary .sb-link { font-size: 0.83rem; }
    .sb-children .sb-children .sb-children .sb-node > summary .sb-link { font-size: 0.8rem; }

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
      transition: border-color .15s, color .15s;
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
      transition: background-color 0.2s, color 0.2s, padding-left .15s cubic-bezier(.4, 0, .2, 1) !important;
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
