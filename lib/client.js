// @local/dsh-html-gallery — client half
//
// 中央面板：左侧是「按项目分类」的 HTML 文件树（可收起），右侧用 iframe 打开原文件。
// 与宿主端通过同源 HTTP 前缀 /api/dsh-html-gallery 通信。
// 注意：GUI 用 <base href="./">，客户端请求必须用文档相对路径（不带前导斜杠）。

window.__ModuleLoader__.load({
  id: '@local/dsh-html-gallery',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    const PANEL_ID = 'html-gallery'
    const PANEL_ORDER = 45
    const API = {
      snapshot: 'api/dsh-html-gallery/snapshot',
      createCategory: 'api/dsh-html-gallery/categories/create',
      renameCategory: 'api/dsh-html-gallery/categories/rename',
      deleteEntry: 'api/dsh-html-gallery/delete',
      addRoot: 'api/dsh-html-gallery/roots/add',
      removeRoot: 'api/dsh-html-gallery/roots/remove',
    }
    const STORE = {
      collapsed: 'dsh-html-gallery:v1:collapsed',
      selected: 'dsh-html-gallery:v1:selected',
      closedCats: 'dsh-html-gallery:v1:closed-categories',
    }

    // ------------------------------------------------------------------
    // 样式
    // ------------------------------------------------------------------

    const CSS_ID = '@local/dsh-html-gallery/client/panel.css'
    const CSS = [
      '.hgal-root{position:relative;height:100%;min-height:0;width:100%;display:flex;overflow:hidden;background:var(--dsw-alias-bg-base,#1b1b1f);color:var(--dsw-alias-label-primary,#e8e8ea);font-family:var(--dsw-font-family,system-ui,-apple-system,"Segoe UI",sans-serif);font-size:13px}',
      '.hgal-side{flex:none;width:264px;min-height:0;overflow:hidden;border-right:1px solid var(--dsw-alias-border-l1,#2c2c33);background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-layer-1,#202026));transition:width .18s ease,opacity .16s ease,border-color .18s ease}',
      '.hgal-root[data-collapsed="true"] .hgal-side{width:0;opacity:0;border-right-color:transparent;pointer-events:none}',
      '.hgal-side-inner{width:264px;height:100%;min-height:0;display:flex;flex-direction:column}',
      '.hgal-side-head{flex:none;display:flex;align-items:flex-start;gap:8px;padding:15px 12px 8px 15px}',
      '.hgal-add-cat{width:26px;height:26px;flex:none;margin-top:1px}',
      '.hgal-brand{flex:1;min-width:0}',
      '.hgal-brand-row{display:flex;align-items:center;gap:7px;min-width:0}',
      '.hgal-brand-title{font-size:14px;font-weight:700;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.01em}',
      '.hgal-pill{flex:none;font-size:10px;line-height:15px;padding:1px 6px;border-radius:999px;color:var(--dsw-alias-label-secondary,#9b9ba3);background:var(--dsw-alias-bg-layer-2,#26262d);border:1px solid var(--dsw-alias-border-l1,#2c2c33)}',
      '.hgal-brand-sub{margin-top:2px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary,#76767e);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.hgal-search{flex:none;position:relative;display:flex;align-items:center;margin:2px 12px 8px}',
      '.hgal-search svg{position:absolute;left:9px;pointer-events:none;color:var(--dsw-alias-label-tertiary,#76767e)}',
      '.hgal-search input{width:100%;height:31px;box-sizing:border-box;padding:0 10px 0 30px;font-family:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary,#e8e8ea);background:var(--dsw-specific-input-major,#24242a);border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:8px;outline:none}',
      '.hgal-search input::placeholder{color:var(--dsw-alias-label-tertiary,#76767e)}',
      '.hgal-search input:focus{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.hgal-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:1px 8px 12px}',
      '.hgal-scroll::-webkit-scrollbar{width:10px;height:10px}',
      '.hgal-scroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2,#3a3a42);border-radius:6px;border:2px solid transparent;background-clip:padding-box}',
      '.hgal-scroll::-webkit-scrollbar-track{background:transparent}',
      '.hgal-cat{margin-bottom:1px}',
      '.hgal-cat-head{width:100%;display:flex;align-items:center;gap:5px;padding:6px 7px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary,#76767e);cursor:pointer;font-family:inherit;font-size:10.5px;font-weight:600;letter-spacing:.05em;text-align:left;text-transform:uppercase}',
      '.hgal-cat-head:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.05));color:var(--dsw-alias-label-secondary,#9b9ba3)}',
      '.hgal-cat-chevron{flex:none;opacity:.75;transition:transform .14s ease}',
      '.hgal-cat[data-open="true"] .hgal-cat-chevron{transform:rotate(90deg)}',
      '.hgal-cat-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.hgal-cat-root{flex:none;max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#26262d);color:var(--dsw-alias-label-tertiary,#76767e);font-size:9px;font-weight:500;letter-spacing:0;text-transform:none}',
      '.hgal-cat-count{flex:none;font-size:10px;font-weight:500;letter-spacing:0;color:var(--dsw-alias-label-tertiary,#76767e)}',
      '.hgal-cat-row{display:flex;align-items:center;gap:1px;min-width:0}',
      '.hgal-cat-row .hgal-cat-head{flex:1;min-width:0;width:auto}',
      '.hgal-cat-edit{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#76767e);cursor:pointer;opacity:0;pointer-events:none;transition:opacity .12s,background .12s,color .12s}',
      '.hgal-cat-row:hover .hgal-cat-edit,.hgal-cat-edit:focus-visible{opacity:1;pointer-events:auto}',
      '.hgal-cat-edit:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.07));color:var(--dsw-alias-label-primary,#e8e8ea)}',
      '@media (hover:none){.hgal-cat-edit{opacity:.65;pointer-events:auto}}',
      '.hgal-cat-empty{padding:4px 10px 7px 26px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#76767e)}',
      '.hgal-add-row{width:100%;display:flex;align-items:center;gap:7px;margin-top:4px;padding:7px 9px;border:1px dashed var(--dsw-alias-border-l2,#3a3a42);border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary,#76767e);cursor:pointer;font-family:inherit;font-size:11.5px;text-align:left}',
      '.hgal-add-row:hover{border-color:var(--dsw-alias-brand-primary,#6d8bff);color:var(--dsw-alias-label-primary,#e8e8ea);background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.05))}',
      '.hgal-items{padding:0 0 3px}',
      '.hgal-item{width:100%;min-width:0;display:flex;align-items:center;gap:9px;padding:7px 8px;margin:1px 0;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;font-family:inherit;cursor:pointer}',
      '.hgal-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.05))}',
      '.hgal-item[data-active="true"]{background:var(--dsw-alias-interactive-bg-selected,rgba(77,107,254,.16))}',
      '.hgal-item-icon{flex:none;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:6px;color:var(--dsw-alias-label-secondary,#9b9ba3);background:var(--dsw-alias-bg-layer-2,#26262d);border:1px solid var(--dsw-alias-border-l1,#2c2c33)}',
      '.hgal-item[data-active="true"] .hgal-item-icon{color:var(--dsw-alias-brand-primary,#6d8bff);background:rgba(77,107,254,.12);border-color:transparent}',
      '.hgal-item-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.hgal-item-title{font-size:12.5px;font-weight:600;line-height:17px;color:var(--dsw-alias-label-primary,#e8e8ea);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.hgal-item-sub{font-size:10.5px;line-height:14px;color:var(--dsw-alias-label-tertiary,#76767e);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.hgal-none{padding:16px 12px;text-align:center;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#76767e)}',
      '.hgal-side-error{flex:none;margin:0 12px 8px;padding:7px 9px;border:1px solid var(--dsw-alias-state-error-primary,#f26d6d);border-radius:8px;color:var(--dsw-alias-state-error-primary,#f26d6d);font-size:11.5px;line-height:16px;word-break:break-word}',
      '.hgal-side-foot{flex:none;padding:8px 12px 10px;border-top:1px solid var(--dsw-alias-border-l1,#2c2c33)}',
      '.hgal-foot-btn{display:block;width:100%;box-sizing:border-box;border:0;border-radius:7px;background:transparent;color:inherit;font-family:inherit;text-align:left;cursor:pointer}',
      '.hgal-foot-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.05))}',
      '.hgal-foot-row{display:flex;align-items:center;gap:6px;min-width:0;font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-tertiary,#76767e)}',
      '.hgal-foot-row svg{flex:none;opacity:.8}',
      '.hgal-foot-path{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.hgal-foot-err{flex:none;color:var(--dsw-alias-state-error-primary,#f26d6d)}',
      '.hgal-foot-chevron{flex:none;opacity:.5;transform:rotate(90deg)}',
      '.hgal-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#1b1b1f)}',
      '.hgal-topbar{flex:none;height:54px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid var(--dsw-alias-border-l1,#2c2c33)}',
      '.hgal-icon-btn{flex:none;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#9b9ba3);cursor:pointer;font-family:inherit;text-decoration:none;transition:background .12s,color .12s}',
      '.hgal-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,#e8e8ea)}',
      '.hgal-icon-btn[disabled]{opacity:.45;cursor:default;background:transparent}',
      '.hgal-icon-btn[data-spinning="true"] svg{animation:hgal-spin .8s linear infinite}',
      '.hgal-toggle{color:var(--dsw-alias-label-secondary,#9b9ba3)}',
      '.hgal-toggle[data-collapsed="true"]{color:var(--dsw-alias-brand-primary,#6d8bff)}',
      '.hgal-doc{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;padding-left:2px}',
      '.hgal-doc-title{font-size:13.5px;font-weight:650;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.hgal-doc-meta{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary,#76767e);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.hgal-actions{flex:none;display:flex;align-items:center;gap:2px}',
      '.hgal-sep{width:1px;height:16px;margin:0 3px;background:var(--dsw-alias-border-l1,#2c2c33)}',
      '.hgal-stage{flex:1;min-height:0;position:relative;display:flex;padding:10px 12px 12px;background:var(--dsw-alias-bg-base,#1b1b1f)}',
      '.hgal-frame{width:100%;height:100%;display:block;border:0;border-radius:10px;background:#fff;color-scheme:light;box-shadow:0 0 0 1px var(--dsw-alias-border-l1,#2c2c33),0 8px 24px rgba(0,0,0,.10)}',
      '.hgal-progress{position:absolute;top:10px;left:12px;right:12px;height:2px;z-index:3;overflow:hidden;border-radius:2px;pointer-events:none}',
      '.hgal-progress::after{content:"";display:block;width:38%;height:100%;border-radius:2px;background:var(--dsw-alias-brand-primary,#6d8bff);animation:hgal-progress 1.1s ease-in-out infinite}',
      '.hgal-empty{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px;text-align:center}',
      '.hgal-empty-art{width:64px;height:64px;display:flex;align-items:center;justify-content:center;border-radius:16px;color:var(--dsw-alias-brand-primary,#6d8bff);background:var(--dsw-alias-bg-layer-1,#202026);border:1px solid var(--dsw-alias-border-l1,#2c2c33)}',
      '.hgal-empty-title{font-size:14px;font-weight:650;line-height:20px}',
      '.hgal-empty-text{max-width:44ch;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#9b9ba3)}',
      '.hgal-btn{display:inline-flex;align-items:center;gap:6px;margin-top:2px;padding:6px 12px;border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:8px;background:var(--dsw-specific-input-major,#24242a);color:var(--dsw-alias-label-primary,#e8e8ea);font-family:inherit;font-size:12px;line-height:17px;cursor:pointer}',
      '.hgal-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}',
      '.hgal-btn-primary{border-color:transparent;background:#4d6bfe;color:#fff}',
      '.hgal-btn-primary:hover{background:#4d6bfe;filter:brightness(1.08)}',
      '.hgal-btn-danger{border-color:transparent;background:#c24545;color:#fff}',
      '.hgal-btn-danger:hover{background:#d14f4f}',
      '.hgal-empty-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}',
      '.hgal-modal{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.46)}',
      '.hgal-dialog{width:min(390px,100%);max-height:calc(100% - 20px);box-sizing:border-box;padding:18px;overflow:auto;border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:14px;background:var(--dsw-alias-bg-layer-1,#202026);color:var(--dsw-alias-label-primary,#e8e8ea);box-shadow:0 18px 54px rgba(0,0,0,.45)}',
      '.hgal-dialog-wide{width:min(520px,100%)}',
      '.hgal-dialog-title{font-size:15px;font-weight:700;line-height:21px}',
      '.hgal-dialog-desc{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#9b9ba3)}',
      '.hgal-field{display:flex;flex-direction:column;gap:6px;margin-top:15px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#9b9ba3)}',
      '.hgal-field input,.hgal-field select{width:100%;height:34px;box-sizing:border-box;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:8px;outline:none;background:var(--dsw-specific-input-major,#24242a);color:var(--dsw-alias-label-primary,#e8e8ea);font-family:inherit;font-size:13px}',
      '.hgal-field input:focus,.hgal-field select:focus{border-color:var(--dsw-alias-brand-primary,#6d8bff)}',
      '.hgal-dialog-error{margin-top:10px;padding:7px 9px;border:1px solid var(--dsw-alias-state-error-primary,#f26d6d);border-radius:8px;color:var(--dsw-alias-state-error-primary,#f26d6d);font-size:11.5px;line-height:16px;word-break:break-word}',
      '.hgal-dialog-note{margin-top:10px;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,#76767e);word-break:break-word}',
      '.hgal-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}',
      '.hgal-dialog-actions .hgal-btn{margin-top:0}',
      '.hgal-dialog-actions .hgal-btn[disabled]{opacity:.6;cursor:default}',
      '.hgal-menu{position:fixed;z-index:60;min-width:190px;padding:5px;border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:10px;background:var(--dsw-alias-bg-overlay,#2b2b33);box-shadow:0 12px 32px rgba(0,0,0,.4)}',
      '.hgal-menu-item{width:100%;display:flex;align-items:center;gap:8px;padding:7px 9px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary,#e8e8ea);font-family:inherit;font-size:12px;line-height:17px;text-align:left;cursor:pointer}',
      '.hgal-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.07))}',
      '.hgal-menu-item svg{flex:none;opacity:.8}',
      '.hgal-menu-danger{color:var(--dsw-alias-state-error-primary,#f26d6d)}',
      '.hgal-menu-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1,#2c2c33)}',
      '.hgal-roots-list{margin-top:12px;max-height:260px;overflow:auto;border:1px solid var(--dsw-alias-border-l1,#2c2c33);border-radius:10px}',
      '.hgal-root-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#2c2c33)}',
      '.hgal-root-item:last-child{border-bottom:0}',
      '.hgal-root-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.hgal-root-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600}',
      '.hgal-root-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.hgal-root-kind{flex:none;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#26262d);color:var(--dsw-alias-label-tertiary,#76767e);font-size:9.5px;font-weight:500}',
      '.hgal-root-path{font-size:10.5px;line-height:15px;color:var(--dsw-alias-label-tertiary,#76767e);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.hgal-root-meta{font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary,#76767e)}',
      '.hgal-root-remove{flex:none;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#9b9ba3);font-family:inherit;font-size:11px;cursor:pointer}',
      '.hgal-root-remove:hover{color:var(--dsw-alias-state-error-primary,#f26d6d);border-color:var(--dsw-alias-state-error-primary,#f26d6d)}',
      '.hgal-root-add{display:flex;gap:8px;margin-top:10px}',
      '.hgal-root-add input{flex:1;min-width:0;height:34px;box-sizing:border-box;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:8px;outline:none;background:var(--dsw-specific-input-major,#24242a);color:var(--dsw-alias-label-primary,#e8e8ea);font-family:inherit;font-size:13px}',
      '.hgal-root-add input:focus{border-color:var(--dsw-alias-brand-primary,#6d8bff)}',
      '.hgal-root-add .hgal-btn{flex:none;margin-top:0}',
      '.hgal-toast{position:absolute;left:50%;bottom:20px;z-index:20;max-width:min(520px,80%);padding:7px 13px;overflow:hidden;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#3a3a42);background:var(--dsw-alias-bg-overlay,#2b2b33);color:var(--dsw-alias-label-primary,#e8e8ea);font-size:12px;line-height:17px;text-overflow:ellipsis;white-space:nowrap;box-shadow:0 8px 22px rgba(0,0,0,.35);transform:translateX(-50%)}',
      '.hgal-toast[data-kind="err"]{color:var(--dsw-alias-state-error-primary,#f26d6d);border-color:var(--dsw-alias-state-error-primary,#f26d6d)}',
      '@keyframes hgal-spin{to{transform:rotate(360deg)}}',
      '@keyframes hgal-progress{0%{transform:translateX(-100%)}100%{transform:translateX(360%)}}',
    ].join('\n')

    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="' + CSS_ID + '"]')) return
      const tag = document.createElement('style')
      tag.dataset.plugin = '@local/dsh-html-gallery'
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ------------------------------------------------------------------
    // 小工具
    // ------------------------------------------------------------------

    function readStore(key, fallback) {
      try {
        const value = window.localStorage.getItem(key)
        return value === null ? fallback : value
      } catch {
        return fallback
      }
    }

    function readJsonStore(key, fallback) {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) || '')
        return parsed && typeof parsed === 'object' ? parsed : fallback
      } catch {
        return fallback
      }
    }

    function writeStore(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        /* localStorage 不可用时静默降级 */
      }
    }

    function requestJson(url, options) {
      const opts = Object.assign({ credentials: 'same-origin' }, options || {})
      if (opts.body && typeof opts.body !== 'string') {
        opts.headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {})
        opts.body = JSON.stringify(opts.body)
      }
      return fetch(url, opts).then((res) => {
        return res.text().then((raw) => {
          let data = null
          try {
            data = raw ? JSON.parse(raw) : null
          } catch {
            data = null
          }
          if (!res.ok) {
            const message = data && data.error ? String(data.error) : '请求失败（' + res.status + '）'
            throw new Error(message)
          }
          if (data === null && raw) throw new Error('返回内容不是 JSON')
          return data
        })
      })
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value)
    }

    function formatDate(iso) {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      const now = new Date()
      const year = date.getFullYear() === now.getFullYear() ? '' : date.getFullYear() + '-'
      return year + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes())
    }

    function rootKindLabel(kind) {
      if (kind === 'workspace') return '自动'
      if (kind === 'extra') return '手动'
      return '固定'
    }

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text)
      }
      return new Promise((resolve, reject) => {
        const area = document.createElement('textarea')
        area.value = text
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        try {
          const ok = document.execCommand('copy')
          document.body.removeChild(area)
          if (ok) resolve()
          else reject(new Error('copy failed'))
        } catch (error) {
          document.body.removeChild(area)
          reject(error)
        }
      })
    }

    // ------------------------------------------------------------------
    // 图标
    // ------------------------------------------------------------------

    function svg(props) {
      const children = Array.prototype.slice.call(arguments, 1)
      const merged = Object.assign({
        width: 18,
        height: 18,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }, props || {})
      return h.apply(null, ['svg', merged].concat(children))
    }

    function GalleryIcon(props) {
      const size = (props && props.size) || 20
      const active = !!(props && props.active)
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        style: { display: 'block', opacity: active ? 1 : 0.82 },
      },
        h('rect', { key: 'frame', x: 3, y: 4.4, width: 18, height: 15.2, rx: 2.6 }),
        h('path', { key: 'split', d: 'M9.2 4.6v14.8' }),
        h('path', { key: 'lines', d: 'M5.7 8h1.2M5.7 11h1.2M5.7 14h1.2' }),
        h('path', { key: 'code-l', d: 'm12.4 9.8-1.9 2.3 1.9 2.3' }),
        h('path', { key: 'code-r', d: 'm17.4 9.8 1.9 2.3-1.9 2.3' }),
      )
    }

    function SearchIcon() {
      return svg({ width: 14, height: 14 }, h('circle', { key: 'c', cx: 10.8, cy: 10.8, r: 6.4 }), h('path', { key: 'l', d: 'm15.6 15.6 4.4 4.4' }))
    }

    function ChevronIcon() {
      return svg({ width: 12, height: 12 }, h('path', { key: 'p', d: 'm9 5 7 7-7 7' }))
    }

    function PanelIcon(props) {
      return svg({ width: 18, height: 18, style: props && props.style },
        h('rect', { key: 'f', x: 3, y: 4, width: 18, height: 16, rx: 2.5 }),
        h('path', { key: 's', d: 'M9 4v16' }),
      )
    }

    function RefreshIcon() {
      return svg({},
        h('path', { key: 'a', d: 'M20 11.2A8 8 0 1 0 18.6 16' }),
        h('path', { key: 'b', d: 'M20 4.8v6.4h-6.4' }),
      )
    }

    function ReloadIcon() {
      return svg({},
        h('path', { key: 'a', d: 'M4 11a8 8 0 1 1 2.1 5.6' }),
        h('path', { key: 'b', d: 'M4 19.2V13h6.2' }),
      )
    }

    function ExternalIcon() {
      return svg({},
        h('path', { key: 'a', d: 'M14.5 4H20v5.5' }),
        h('path', { key: 'b', d: 'm20 4-8.6 8.6' }),
        h('path', { key: 'c', d: 'M19 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5' }),
      )
    }

    function CopyIcon() {
      return svg({},
        h('rect', { key: 'a', x: 9, y: 9, width: 11, height: 11, rx: 2 }),
        h('path', { key: 'b', d: 'M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5' }),
      )
    }

    function DocIcon() {
      return svg({ width: 14, height: 14 },
        h('path', { key: 'a', d: 'M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5Z' }),
        h('path', { key: 'b', d: 'M13 3.5V9h5' }),
        h('path', { key: 'c', d: 'm10 12-2 2.2 2 2.3M14.4 12l2 2.2-2 2.3' }),
      )
    }

    function FolderIcon(props) {
      const size = (props && props.size) || 12
      return svg({ width: size, height: size }, h('path', { key: 'a', d: 'M3 7a2 2 0 0 1 2-2h3.6l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' }))
    }

    function TrashIcon() {
      return svg({ width: 14, height: 14 },
        h('path', { key: 'a', d: 'M4 7h16' }),
        h('path', { key: 'b', d: 'M9 7V4.8h6V7' }),
        h('path', { key: 'c', d: 'm6.2 7 .9 12.2h9.8L17.8 7' }),
        h('path', { key: 'd', d: 'M10 10.5v5M14 10.5v5' }),
      )
    }

    function PlusIcon() {
      return svg({ width: 14, height: 14 }, h('path', { key: 'a', d: 'M12 5v14M5 12h14' }))
    }

    function PencilIcon() {
      return svg({ width: 13, height: 13 },
        h('path', { key: 'a', d: 'M4.5 19.5H8l10.4-10.4a2 2 0 0 0-2.8-2.8L5.2 16.7l-.7 2.8Z' }),
        h('path', { key: 'b', d: 'm14.2 7.5 2.8 2.8' }),
      )
    }

    function WindowArt() {
      return svg({ width: 32, height: 32, strokeWidth: 1.5 },
        h('rect', { key: 'a', x: 3, y: 4.5, width: 18, height: 15, rx: 2.6 }),
        h('path', { key: 'b', d: 'M3 9h18' }),
        h('circle', { key: 'c', cx: 6.4, cy: 6.8, r: 0.7, fill: 'currentColor', stroke: 'none' }),
        h('circle', { key: 'd', cx: 8.9, cy: 6.8, r: 0.7, fill: 'currentColor', stroke: 'none' }),
        h('path', { key: 'e', d: 'm9.8 13-2 2.2 2 2.2M14.8 13l2.2 2.2-2 2.2' }),
      )
    }

    function WarnIcon() {
      return svg({ width: 13, height: 13 }, h('circle', { key: 'a', cx: 12, cy: 12, r: 9 }), h('path', { key: 'b', d: 'M12 7.5v5.2' }), h('path', { key: 'c', d: 'M12 16.4h.01' }))
    }

    // ------------------------------------------------------------------
    // 页面
    // ------------------------------------------------------------------

    function App() {
      ensureCss()

      const [snapshot, setSnapshot] = useState(null)
      const [error, setError] = useState('')
      const [loading, setLoading] = useState(true)
      const [refreshing, setRefreshing] = useState(false)
      const [query, setQuery] = useState('')
      const [collapsed, setCollapsed] = useState(() => readStore(STORE.collapsed, '0') === '1')
      const [selectedKey, setSelectedKey] = useState(() => readStore(STORE.selected, ''))
      const [closedCats, setClosedCats] = useState(() => readJsonStore(STORE.closedCats, {}))
      const [reloadTick, setReloadTick] = useState(0)
      const [frameLoading, setFrameLoading] = useState(true)
      const [categoryDialog, setCategoryDialog] = useState(null)
      const [categoryName, setCategoryName] = useState('')
      const [categoryBusy, setCategoryBusy] = useState(false)
      const [categoryError, setCategoryError] = useState('')
      const [rootsDialog, setRootsDialog] = useState(false)
      const [rootPath, setRootPath] = useState('')
      const [rootBusy, setRootBusy] = useState(false)
      const [rootError, setRootError] = useState('')
      const [contextMenu, setContextMenu] = useState(null)
      const [deleteTarget, setDeleteTarget] = useState(null)
      const [deleteBusy, setDeleteBusy] = useState(false)
      const [deleteError, setDeleteError] = useState('')
      const [toast, setToast] = useState(null)
      const toastTimer = useRef(null)
      const categoryInputRef = useRef(null)
      const rootInputRef = useRef(null)
      const lastLoadedAt = useRef(0)

      const notify = useCallback((text, kind) => {
        setToast({ text: String(text), kind: kind || 'ok' })
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 2800)
      }, [])

      const load = useCallback((force) => {
        if (force) setRefreshing(true)
        setLoading(true)
        return requestJson(API.snapshot + (force ? '?refresh=1' : ''))
          .then((data) => {
            setSnapshot(data)
            setError('')
            lastLoadedAt.current = Date.now()
          })
          .catch((err) => {
            setError(String((err && err.message) || err))
          })
          .finally(() => {
            setLoading(false)
            setRefreshing(false)
          })
      }, [])

      useEffect(() => {
        load(false)
      }, [load])

      useEffect(() => {
        const onFocus = () => {
          if (Date.now() - lastLoadedAt.current > 15000) load(false)
        }
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
      }, [load])

      useEffect(() => {
        writeStore(STORE.collapsed, collapsed ? '1' : '0')
      }, [collapsed])

      useEffect(() => {
        if (selectedKey) writeStore(STORE.selected, selectedKey)
      }, [selectedKey])

      useEffect(() => {
        writeStore(STORE.closedCats, JSON.stringify(closedCats))
      }, [closedCats])

      useEffect(() => {
        return () => {
          if (toastTimer.current) clearTimeout(toastTimer.current)
        }
      }, [])

      useEffect(() => {
        if (!categoryDialog) return undefined
        const timer = setTimeout(() => {
          const input = categoryInputRef.current
          if (input) {
            input.focus()
            input.select()
          }
        }, 40)
        return () => clearTimeout(timer)
      }, [categoryDialog])

      useEffect(() => {
        if (!rootsDialog) return undefined
        const timer = setTimeout(() => {
          if (rootInputRef.current) rootInputRef.current.focus()
        }, 40)
        return () => clearTimeout(timer)
      }, [rootsDialog])

      useEffect(() => {
        if (!contextMenu) return undefined
        const close = () => setContextMenu(null)
        const onKey = (event) => {
          if (event.key === 'Escape') close()
        }
        window.addEventListener('pointerdown', close)
        window.addEventListener('blur', close)
        window.addEventListener('resize', close)
        window.addEventListener('scroll', close, true)
        window.addEventListener('keydown', onKey)
        return () => {
          window.removeEventListener('pointerdown', close)
          window.removeEventListener('blur', close)
          window.removeEventListener('resize', close)
          window.removeEventListener('scroll', close, true)
          window.removeEventListener('keydown', onKey)
        }
      }, [contextMenu])

      const categories = useMemo(() => {
        if (!snapshot || !Array.isArray(snapshot.categories)) return []
        return snapshot.categories
      }, [snapshot])

      const allItems = useMemo(() => {
        const items = []
        for (const category of categories) {
          for (const item of category.items || []) items.push(item)
        }
        return items
      }, [categories])

      const selected = useMemo(() => {
        return allItems.find((item) => item.key === selectedKey) || null
      }, [allItems, selectedKey])

      const active = selected || (allItems.length > 0 ? allItems[0] : null)

      useEffect(() => {
        if (loading) return
        if (selected) return
        if (allItems.length > 0) setSelectedKey(allItems[0].key)
      }, [loading, selected, allItems])

      useEffect(() => {
        if (!active) {
          setFrameLoading(false)
          return
        }
        setFrameLoading(true)
      }, [active ? active.key : '', reloadTick])

      const q = query.trim().toLowerCase()
      const filteredCategories = useMemo(() => {
        if (!q) return categories
        return categories
          .map((category) => {
            const name = String(category.name || '').toLowerCase()
            if (name.includes(q)) return category
            const items = (category.items || []).filter((item) => {
              return (item.title + ' ' + item.name + ' ' + item.path + ' ' + item.category + ' ' + (item.rootLabel || '')).toLowerCase().includes(q)
            })
            return items.length > 0 ? Object.assign({}, category, { items }) : null
          })
          .filter(Boolean)
      }, [categories, q])

      const shownTotal = useMemo(() => {
        let total = 0
        for (const category of filteredCategories) total += (category.items || []).length
        return total
      }, [filteredCategories])

      function toggleCategory(categoryId) {
        setClosedCats((prev) => {
          const next = Object.assign({}, prev)
          if (next[categoryId]) delete next[categoryId]
          else next[categoryId] = true
          return next
        })
      }

      function refreshAll() {
        setReloadTick((tick) => tick + 1)
        load(true)
      }

      function openCreateCategory() {
        const roots = snapshot && Array.isArray(snapshot.roots) ? snapshot.roots : []
        const rootId = active ? active.rootId : (roots[0] ? roots[0].id : '')
        setCategoryDialog({ mode: 'create', rootId })
        setCategoryName('')
        setCategoryError('')
      }

      function openRenameCategory(category) {
        setCategoryDialog({ mode: 'rename', rootId: category.rootId, category })
        setCategoryName(category.topFolder || '')
        setCategoryError('')
      }

      function closeCategoryDialog() {
        if (categoryBusy) return
        setCategoryDialog(null)
        setCategoryError('')
      }

      function submitCategory(event) {
        if (event) event.preventDefault()
        if (!categoryDialog || categoryBusy) return
        const name = categoryName.trim()
        const isRename = categoryDialog.mode === 'rename'
        if (!name) {
          setCategoryError('先给分类起个名字')
          return
        }
        if (isRename && name === categoryDialog.category.topFolder) {
          setCategoryError('名字没有变化')
          return
        }

        setCategoryBusy(true)
        setCategoryError('')
        const body = isRename
          ? { rootId: categoryDialog.rootId, from: categoryDialog.category.topFolder, to: name }
          : { rootId: categoryDialog.rootId, name }

        requestJson(isRename ? API.renameCategory : API.createCategory, { method: 'POST', body })
          .then((data) => {
            const nextSnapshot = data && data.snapshot ? data.snapshot : null
            if (nextSnapshot) setSnapshot(nextSnapshot)

            if (isRename && nextSnapshot && active && active.categoryId === categoryDialog.category.id) {
              const folder = categoryDialog.category.topFolder
              const oldPrefix = folder + '/'
              if (active.path.indexOf(oldPrefix) === 0) {
                const renamedPath = name + '/' + active.path.slice(oldPrefix.length)
                setSelectedKey(categoryDialog.rootId + ':' + renamedPath)
              }
            }

            setCategoryDialog(null)
            notify(isRename ? '分类已重命名为「' + name + '」' : '分类「' + name + '」建好了')
          })
          .catch((err) => setCategoryError(String((err && err.message) || err)))
          .finally(() => setCategoryBusy(false))
      }

      function copyPath() {
        if (!active) return
        const text = active.absPath || active.path
        copyText(text)
          .then(() => notify('路径已复制'))
          .catch(() => notify('复制没成功，路径是 ' + text, 'err'))
      }

      function openRootsDialog() {
        setRootsDialog(true)
        setRootPath('')
        setRootError('')
      }

      function closeRootsDialog() {
        if (rootBusy) return
        setRootsDialog(false)
        setRootError('')
      }

      function submitRoot(event) {
        if (event) event.preventDefault()
        if (rootBusy) return
        const value = rootPath.trim().replace(/^"(.*)"$/, '$1').trim()
        if (!value) {
          setRootError('先填一个文件夹路径')
          return
        }
        setRootBusy(true)
        setRootError('')
        requestJson(API.addRoot, { method: 'POST', body: { path: value } })
          .then((data) => {
            if (data && data.snapshot) setSnapshot(data.snapshot)
            setRootPath('')
            if (data && data.added) {
              notify('已加入扫描：' + ((data.root && data.root.path) || value))
            } else {
              notify('这个目录已经在扫描范围里了')
            }
          })
          .catch((err) => setRootError(String((err && err.message) || err)))
          .finally(() => setRootBusy(false))
      }

      function removeRoot(root) {
        if (rootBusy || !root || root.kind !== 'extra') return
        setRootBusy(true)
        setRootError('')
        requestJson(API.removeRoot, { method: 'POST', body: { rootId: root.id } })
          .then((data) => {
            if (data && data.snapshot) setSnapshot(data.snapshot)
            if (active && active.rootId === root.id) setSelectedKey('')
            notify('已从扫描列表移除，文件没删')
          })
          .catch((err) => setRootError(String((err && err.message) || err)))
          .finally(() => setRootBusy(false))
      }

      function openFileMenu(event, item) {
        event.preventDefault()
        event.stopPropagation()
        setContextMenu({
          kind: 'file',
          item,
          x: Math.min(event.clientX, window.innerWidth - 210),
          y: Math.min(event.clientY, window.innerHeight - 150),
        })
      }

      function openCategoryMenu(event, category) {
        if (!category.topFolder) return
        event.preventDefault()
        event.stopPropagation()
        setContextMenu({
          kind: 'category',
          category,
          x: Math.min(event.clientX, window.innerWidth - 210),
          y: Math.min(event.clientY, window.innerHeight - 150),
        })
      }

      function closeContextMenu() {
        setContextMenu(null)
      }

      function askDeleteFile(item) {
        setContextMenu(null)
        setDeleteError('')
        setDeleteTarget({
          kind: 'file',
          rootId: item.rootId,
          path: item.path,
          name: item.name,
          title: item.title,
          item,
        })
      }

      function askDeleteCategory(category) {
        setContextMenu(null)
        setDeleteError('')
        setDeleteTarget({
          kind: 'category',
          rootId: category.rootId,
          name: category.topFolder,
          title: category.name,
          category,
        })
      }

      function closeDeleteDialog() {
        if (deleteBusy) return
        setDeleteTarget(null)
        setDeleteError('')
      }

      function submitDelete() {
        if (!deleteTarget || deleteBusy) return
        const target = deleteTarget
        const body = target.kind === 'file'
          ? { kind: 'file', rootId: target.rootId, path: target.path }
          : { kind: 'category', rootId: target.rootId, name: target.name }
        setDeleteBusy(true)
        setDeleteError('')
        requestJson(API.deleteEntry, { method: 'POST', body })
          .then((data) => {
            if (data && data.snapshot) setSnapshot(data.snapshot)
            if (target.kind === 'file') {
              if (active && active.key === target.item.key) setSelectedKey('')
              notify('「' + target.name + '」已移到插件回收站')
            } else {
              if (active && active.categoryId === target.category.id) setSelectedKey('')
              notify('分类「' + target.name + '」已移到插件回收站')
            }
            setDeleteTarget(null)
          })
          .catch((err) => setDeleteError(String((err && err.message) || err)))
          .finally(() => setDeleteBusy(false))
      }

      const total = snapshot && typeof snapshot.total === 'number' ? snapshot.total : 0
      const categoryCount = categories.length
      const roots = snapshot && Array.isArray(snapshot.roots) ? snapshot.roots : []
      const brandSub = loading && !snapshot
        ? '正在扫描…'
        : total > 0
          ? total + ' 个页面 · ' + categoryCount + ' 个项目'
          : '还没有 HTML 文件'

      const docTitle = active ? active.title : 'HTML 作品廊'
      const docMeta = active
        ? (roots.length > 1 && active.rootLabel ? active.rootLabel + ' · ' : '')
          + active.name + ' · ' + active.sizeLabel + ' · ' + formatDate(active.mtime)
        : loading
          ? '正在扫描 HTML 文件…'
          : total > 0
            ? total + ' 个页面 · 从左侧挑一个打开'
            : '把做好的网页放进工作区，这里会按项目收好'

      const dialogRoot = categoryDialog
        ? roots.find((root) => root.id === categoryDialog.rootId)
        : null
      const isRenameDialog = !!(categoryDialog && categoryDialog.mode === 'rename')

      return h('div', { className: 'hgal-root', 'data-collapsed': collapsed ? 'true' : 'false' },
        h('aside', { className: 'hgal-side', 'aria-hidden': collapsed ? 'true' : 'false' },
          h('div', { className: 'hgal-side-inner' },
            h('div', { className: 'hgal-side-head' },
              h('div', { className: 'hgal-brand' },
                h('div', { className: 'hgal-brand-row' },
                  h('span', { className: 'hgal-brand-title' }, 'HTML 作品廊'),
                  total > 0 ? h('span', { className: 'hgal-pill' }, total) : null,
                ),
                h('div', { className: 'hgal-brand-sub' }, brandSub),
              ),
              h('button', {
                type: 'button',
                className: 'hgal-icon-btn hgal-add-cat',
                title: '管理扫描目录',
                'aria-label': '管理扫描目录',
                onClick: openRootsDialog,
              }, h(FolderIcon, { size: 15 })),
              snapshot && Array.isArray(snapshot.roots) && snapshot.roots.length > 0
                ? h('button', {
                    type: 'button',
                    className: 'hgal-icon-btn hgal-add-cat',
                    title: '新建分类目录',
                    'aria-label': '新建分类目录',
                    onClick: openCreateCategory,
                  }, h(PlusIcon))
                : null,
            ),
            h('div', { className: 'hgal-search' },
              h(SearchIcon),
              h('input', {
                type: 'search',
                value: query,
                placeholder: '搜索项目或页面…',
                'aria-label': '搜索 HTML 页面',
                spellCheck: false,
                onChange: (event) => setQuery(event.target.value),
              }),
            ),
            error ? h('div', { className: 'hgal-side-error' }, error) : null,
            h('div', { className: 'hgal-scroll' },
              loading && !snapshot
                ? h('div', { className: 'hgal-none' }, '正在扫描…')
                : filteredCategories.length === 0
                  ? h('div', { className: 'hgal-none' },
                      q
                        ? '没有匹配的页面'
                        : total > 0
                          ? '换个关键词试试'
                          : '工作区里还没有 .html 文件',
                    )
                  : filteredCategories.map((category) => {
                      const open = q ? true : !closedCats[category.id]
                      return h('div', { key: category.id, className: 'hgal-cat', 'data-open': open ? 'true' : 'false' },
                        h('div', {
                          className: 'hgal-cat-row',
                          onContextMenu: (event) => openCategoryMenu(event, category),
                        },
                          h('button', {
                            type: 'button',
                            className: 'hgal-cat-head',
                            title: open ? '收起此项目' : '展开此项目',
                            onClick: () => toggleCategory(category.id),
                          },
                            h('span', { className: 'hgal-cat-chevron' }, h(ChevronIcon)),
                            h('span', { className: 'hgal-cat-name' }, category.name),
                            roots.length > 1
                              ? h('span', {
                                  className: 'hgal-cat-root',
                                  title: category.rootLabel,
                                }, category.rootLabel)
                              : null,
                            h('span', { className: 'hgal-cat-count' }, category.items.length),
                          ),
                          category.topFolder
                            ? h('button', {
                                type: 'button',
                                className: 'hgal-cat-edit',
                                title: '重命名分类目录',
                                'aria-label': '重命名分类目录 ' + category.name,
                                onClick: () => openRenameCategory(category),
                              }, h(PencilIcon))
                            : null,
                        ),
                        open
                          ? h('div', { className: 'hgal-items' },
                              category.items.length === 0
                                ? h('div', { className: 'hgal-cat-empty' }, '空分类 · 把 HTML 放进来就会出现在这里')
                                : category.items.map((item) => h('button', {
                                    key: item.key,
                                    type: 'button',
                                    className: 'hgal-item',
                                    'data-active': active && active.key === item.key ? 'true' : 'false',
                                    title: item.title + '\n' + item.path,
                                    onClick: () => setSelectedKey(item.key),
                                    onContextMenu: (event) => openFileMenu(event, item),
                                  },
                                    h('span', { className: 'hgal-item-icon' }, h(DocIcon)),
                                    h('span', { className: 'hgal-item-body' },
                                      h('span', { className: 'hgal-item-title' }, item.title),
                                      h('span', { className: 'hgal-item-sub' },
                                        (roots.length > 1 && item.rootLabel ? item.rootLabel + ' · ' : '')
                                          + item.path + ' · ' + formatDate(item.mtime)),
                                    ),
                                  )),
                            )
                          : null,
                      )
                    }),
              snapshot && Array.isArray(snapshot.roots) && snapshot.roots.length > 0 && !q
                ? h('button', {
                    type: 'button',
                    className: 'hgal-add-row',
                    title: '在当前扫描目录下新建分类文件夹',
                    onClick: openCreateCategory,
                  }, h(PlusIcon), h('span', null, '新建分类目录'))
                : null,
            ),
            h('button', {
              type: 'button',
              className: 'hgal-side-foot hgal-foot-btn',
              title: '管理扫描目录',
              onClick: openRootsDialog,
            },
              h('div', { className: 'hgal-foot-row' },
                h(FolderIcon, { size: 13 }),
                h('span', { className: 'hgal-foot-path' },
                  roots.length === 0
                    ? '添加扫描目录'
                    : roots.length === 1
                      ? roots[0].path
                      : roots.length + ' 个扫描目录'),
                h('span', { className: 'hgal-foot-chevron' }, h(ChevronIcon)),
              ),
              roots.some((root) => root.error) ? h('div', { className: 'hgal-foot-row' }, '有目录读取失败，点开查看') : null,
              snapshot && snapshot.truncated ? h('div', { className: 'hgal-foot-row' }, '文件太多，只收了前面一部分') : null,
            ),
          ),
        ),

        h('main', { className: 'hgal-main' },
          h('div', { className: 'hgal-topbar' },
            h('button', {
              type: 'button',
              className: 'hgal-icon-btn hgal-toggle',
              'data-collapsed': collapsed ? 'true' : 'false',
              title: collapsed ? '展开侧栏' : '收起侧栏，专心看页面',
              'aria-label': collapsed ? '展开侧栏' : '收起侧栏',
              onClick: () => setCollapsed((value) => !value),
            }, h(PanelIcon)),
            h('div', { className: 'hgal-doc' },
              h('div', { className: 'hgal-doc-title', title: active ? active.absPath || active.path : 'HTML 作品廊' }, docTitle),
              h('div', { className: 'hgal-doc-meta' }, docMeta),
            ),
            h('div', { className: 'hgal-actions' },
              active ? h('button', {
                type: 'button',
                className: 'hgal-icon-btn',
                title: '复制文件的完整路径',
                'aria-label': '复制文件路径',
                onClick: copyPath,
              }, h(CopyIcon)) : null,
              active ? h('a', {
                className: 'hgal-icon-btn',
                href: active.url,
                target: '_blank',
                rel: 'noreferrer',
                title: '在新标签页打开',
                'aria-label': '在新标签页打开',
              }, h(ExternalIcon)) : null,
              active ? h('button', {
                type: 'button',
                className: 'hgal-icon-btn',
                title: '重新加载页面',
                'aria-label': '重新加载页面',
                onClick: () => setReloadTick((tick) => tick + 1),
              }, h(ReloadIcon)) : null,
              h('span', { className: 'hgal-sep' }),
              h('button', {
                type: 'button',
                className: 'hgal-icon-btn',
                title: '重新扫描文件（并刷新当前页面）',
                'aria-label': '重新扫描文件',
                disabled: refreshing,
                'data-spinning': refreshing ? 'true' : 'false',
                onClick: refreshAll,
              }, h(RefreshIcon)),
            ),
          ),

          active
            ? h('div', { className: 'hgal-stage' },
                frameLoading ? h('div', { className: 'hgal-progress' }) : null,
                h('iframe', {
                  key: active.key + ':' + reloadTick,
                  className: 'hgal-frame',
                  src: active.url,
                  title: active.title,
                  loading: 'eager',
                  allow: 'fullscreen; clipboard-read; clipboard-write',
                  allowFullScreen: true,
                  onLoad: () => setFrameLoading(false),
                }),
              )
            : h('div', { className: 'hgal-empty' },
                h('div', { className: 'hgal-empty-art' }, h(WindowArt)),
                h('div', { className: 'hgal-empty-title' }, total > 0 ? '选个页面打开' : '这里还没有 HTML 文件'),
                h('div', { className: 'hgal-empty-text' },
                  total > 0
                    ? '从左边的项目列表里点一个，就能在这里直接看。'
                    : '把做好的 .html（以及它旁边的 css / js / 图片）放进工作区，点右上角刷新就会收进来。',
                ),
                total === 0 && !loading
                  ? h('div', { className: 'hgal-empty-actions' },
                      h('button', { type: 'button', className: 'hgal-btn hgal-btn-primary', onClick: refreshAll }, h(RefreshIcon), '重新扫描'),
                      h('button', { type: 'button', className: 'hgal-btn', onClick: openRootsDialog }, h(FolderIcon, { size: 13 }), '添加扫描目录'),
                    )
                  : null,
              ),

          toast ? h('div', { className: 'hgal-toast', 'data-kind': toast.kind }, toast.text) : null,
        ),

        categoryDialog
          ? h('div', {
              className: 'hgal-modal',
              role: 'presentation',
              onMouseDown: (event) => {
                if (event.target === event.currentTarget) closeCategoryDialog()
              },
              onKeyDown: (event) => {
                if (event.key === 'Escape') closeCategoryDialog()
              },
            },
              h('form', {
                className: 'hgal-dialog',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': isRenameDialog ? '重命名分类目录' : '新建分类目录',
                onSubmit: submitCategory,
              },
                h('div', { className: 'hgal-dialog-title' }, isRenameDialog ? '重命名分类目录' : '新建分类目录'),
                h('div', { className: 'hgal-dialog-desc' },
                  isRenameDialog
                    ? '把「' + categoryDialog.category.name + '」改个名字。'
                    : '给 HTML 项目分个类，列表里会多一个文件夹。',
                ),
                roots.length > 1
                  ? h('label', { className: 'hgal-field' },
                      h('span', null, '放到哪个扫描目录'),
                      h('select', {
                        value: categoryDialog.rootId,
                        onChange: (event) => setCategoryDialog(Object.assign({}, categoryDialog, { rootId: event.target.value })),
                      }, roots.map((root) => h('option', { key: root.id, value: root.id }, root.label + ' · ' + root.path))),
                    )
                  : null,
                h('label', { className: 'hgal-field' },
                  h('span', null, '分类名'),
                  h('input', {
                    ref: categoryInputRef,
                    type: 'text',
                    value: categoryName,
                    maxLength: 48,
                    spellCheck: false,
                    placeholder: '例如：小工具、实验页、临时预览',
                    onChange: (event) => {
                      setCategoryName(event.target.value)
                      if (categoryError) setCategoryError('')
                    },
                  }),
                ),
                categoryError ? h('div', { className: 'hgal-dialog-error' }, categoryError) : null,
                h('div', { className: 'hgal-dialog-note' },
                  isRenameDialog
                    ? '会直接改磁盘上的文件夹名，里面的 HTML 会一起移动。'
                    : (dialogRoot
                        ? '会在 ' + dialogRoot.path + ' 下创建同名文件夹；空分类也会显示。'
                        : '会在扫描目录下创建同名文件夹。'),
                ),
                h('div', { className: 'hgal-dialog-actions' },
                  h('button', {
                    type: 'button',
                    className: 'hgal-btn',
                    onClick: closeCategoryDialog,
                    disabled: categoryBusy,
                  }, '取消'),
                  h('button', {
                    type: 'submit',
                    className: 'hgal-btn hgal-btn-primary',
                    disabled: categoryBusy,
                  }, categoryBusy ? (isRenameDialog ? '正在重命名…' : '正在创建…') : (isRenameDialog ? '重命名' : '创建')),
                ),
              ),
            )
          : null,

        contextMenu
          ? h('div', {
              className: 'hgal-menu',
              style: { left: contextMenu.x + 'px', top: contextMenu.y + 'px' },
              onPointerDown: (event) => event.stopPropagation(),
              onContextMenu: (event) => event.preventDefault(),
            },
              contextMenu.kind === 'file'
                ? h(React.Fragment, null,
                    h('button', {
                      type: 'button',
                      className: 'hgal-menu-item',
                      onClick: () => {
                        setSelectedKey(contextMenu.item.key)
                        closeContextMenu()
                      },
                    }, h(DocIcon), '打开'),
                    h('button', {
                      type: 'button',
                      className: 'hgal-menu-item',
                      onClick: () => {
                        const text = contextMenu.item.absPath || contextMenu.item.path
                        copyText(text)
                          .then(() => notify('路径已复制'))
                          .catch(() => notify('复制没成功，路径是 ' + text, 'err'))
                        closeContextMenu()
                      },
                    }, h(CopyIcon), '复制完整路径'),
                    h('div', { className: 'hgal-menu-sep' }),
                    h('button', {
                      type: 'button',
                      className: 'hgal-menu-item hgal-menu-danger',
                      onClick: () => askDeleteFile(contextMenu.item),
                    }, h(TrashIcon), '移到回收站…'),
                  )
                : h(React.Fragment, null,
                    h('button', {
                      type: 'button',
                      className: 'hgal-menu-item',
                      onClick: () => {
                        openRenameCategory(contextMenu.category)
                        closeContextMenu()
                      },
                    }, h(PencilIcon), '重命名分类目录'),
                    h('div', { className: 'hgal-menu-sep' }),
                    h('button', {
                      type: 'button',
                      className: 'hgal-menu-item hgal-menu-danger',
                      onClick: () => askDeleteCategory(contextMenu.category),
                    }, h(TrashIcon), '删除整个分类…'),
                  ),
            )
          : null,

        deleteTarget
          ? h('div', {
              className: 'hgal-modal',
              role: 'presentation',
              onMouseDown: (event) => {
                if (event.target === event.currentTarget) closeDeleteDialog()
              },
              onKeyDown: (event) => {
                if (event.key === 'Escape') closeDeleteDialog()
              },
            },
              h('div', {
                className: 'hgal-dialog',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': deleteTarget.kind === 'file' ? '删除页面' : '删除分类',
              },
                h('div', { className: 'hgal-dialog-title' },
                  deleteTarget.kind === 'file' ? '把这个页面移走？' : '把整个分类移走？'),
                h('div', { className: 'hgal-dialog-desc' },
                  '「' + (deleteTarget.title || deleteTarget.name) + '」会移到插件回收站，不会立刻永久删除。'),
                h('div', { className: 'hgal-dialog-note' },
                  deleteTarget.kind === 'file'
                    ? deleteTarget.path
                    : '整个文件夹（含里面的 HTML 和资源）会一起移动。'),
                deleteError ? h('div', { className: 'hgal-dialog-error' }, deleteError) : null,
                h('div', { className: 'hgal-dialog-actions' },
                  h('button', {
                    type: 'button',
                    className: 'hgal-btn',
                    onClick: closeDeleteDialog,
                    disabled: deleteBusy,
                  }, '取消'),
                  h('button', {
                    type: 'button',
                    className: 'hgal-btn hgal-btn-danger',
                    onClick: submitDelete,
                    disabled: deleteBusy,
                  }, deleteBusy ? '正在移动…' : '移到回收站'),
                ),
              ),
            )
          : null,

        rootsDialog
          ? h('div', {
              className: 'hgal-modal',
              role: 'presentation',
              onMouseDown: (event) => {
                if (event.target === event.currentTarget) closeRootsDialog()
              },
              onKeyDown: (event) => {
                if (event.key === 'Escape') closeRootsDialog()
              },
            },
              h('div', {
                className: 'hgal-dialog hgal-dialog-wide',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': '扫描目录',
              },
                h('div', { className: 'hgal-dialog-title' }, '扫描目录'),
                h('div', { className: 'hgal-dialog-desc' },
                  'DSH 工作区会自动出现；也可以把任意盘里的文件夹加进来。'),
                h('div', { className: 'hgal-roots-list' },
                  roots.length === 0
                    ? h('div', { className: 'hgal-none' }, '还没有扫描目录，先加一个吧')
                    : roots.map((root) => h('div', { key: root.id, className: 'hgal-root-item' },
                        h('div', { className: 'hgal-root-info' },
                          h('div', { className: 'hgal-root-title' },
                            h('span', { className: 'hgal-root-name' }, root.label),
                            h('span', { className: 'hgal-root-kind' }, rootKindLabel(root.kind)),
                          ),
                          h('div', { className: 'hgal-root-path', title: root.path }, root.path),
                          h('div', { className: 'hgal-root-meta' },
                            (root.count || 0) + ' 个页面'
                              + (root.exists === false ? ' · 目录不存在' : '')
                              + (root.error ? ' · ' + root.error : '')),
                        ),
                        root.kind === 'extra'
                          ? h('button', {
                              type: 'button',
                              className: 'hgal-root-remove',
                              disabled: rootBusy,
                              title: '只从扫描列表移除，不删文件',
                              onClick: () => removeRoot(root),
                            }, '移除')
                          : null,
                      )),
                ),
                h('form', { className: 'hgal-root-add', onSubmit: submitRoot },
                  h('input', {
                    ref: rootInputRef,
                    type: 'text',
                    value: rootPath,
                    placeholder: '例如：D:\\我的网页',
                    spellCheck: false,
                    onChange: (event) => {
                      setRootPath(event.target.value)
                      if (rootError) setRootError('')
                    },
                  }),
                  h('button', {
                    type: 'submit',
                    className: 'hgal-btn hgal-btn-primary',
                    disabled: rootBusy,
                  }, rootBusy ? '处理中…' : '添加'),
                ),
                rootError ? h('div', { className: 'hgal-dialog-error' }, rootError) : null,
                h('div', { className: 'hgal-dialog-note' },
                  '可以填单个文件夹，也可以填整个盘。整盘扫描会比较慢；只读 HTML 和它用到的静态资源。'),
                h('div', { className: 'hgal-dialog-actions' },
                  h('button', {
                    type: 'button',
                    className: 'hgal-btn',
                    onClick: closeRootsDialog,
                    disabled: rootBusy,
                  }, '关闭'),
                ),
              ),
            )
          : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        try {
          console.info('[html-gallery] client loaded')
        } catch {
          /* ignore */
        }
        ctx.slots.inject('sidebar.panellist', () => {
          return ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: PANEL_ORDER,
            label: () => 'HTML 作品廊',
          }, GalleryIcon)
        })
        ctx.slots.inject('main', () => {
          return ctx.slots.register({ name: 'main', key: PANEL_ID }, App)
        })
      },
    }
  },
})
