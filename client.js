(() => {
  try {
    /* coldbrew-dsh client half — settings section */
    window.__ModuleLoader__.load({
      id: "coldbrew-dsh",
      factory: (require) => {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

        var react = require("react");
        var inject = ["slots"];

        var ACCENT = "#ef4444";
        var ACCENT_SOFT = "rgba(239, 68, 68, 0.08)";
        var ACCENT_LINE = "rgba(239, 68, 68, 0.55)";
        var LINE = "rgba(128, 128, 128, 0.22)";
        var LINE_SOFT = "rgba(128, 128, 128, 0.12)";

        var S = {
          wrap: {
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            padding: "4px 2px 8px",
            color: "inherit",
            fontFamily: "inherit",
            maxWidth: "760px"
          },
          head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" },
          titleBox: { display: "flex", flexDirection: "column", gap: "4px" },
          title: { fontSize: "17px", fontWeight: 600, letterSpacing: "0.2px", margin: 0 },
          sub: { fontSize: "12.5px", lineHeight: "19px", opacity: 0.55, margin: 0 },
          pill: {
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "3px 9px",
            borderRadius: "999px",
            border: "1px solid " + LINE,
            fontSize: "11px",
            lineHeight: "16px",
            whiteSpace: "nowrap",
            opacity: 0.9
          },
          dot: { width: "6px", height: "6px", borderRadius: "50%", background: ACCENT, flex: "none" },

          list: { display: "flex", flexDirection: "column", gap: "10px" },
          card: {
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: "7px",
            padding: "14px 16px",
            borderRadius: "10px",
            border: "1px solid " + LINE_SOFT,
            background: "transparent",
            cursor: "pointer",
            transition: "border-color .15s ease, background .15s ease, transform .12s ease",
            textAlign: "left",
            color: "inherit",
            font: "inherit"
          },
          cardOn: {
            borderColor: ACCENT_LINE,
            background: ACCENT_SOFT
          },
          cardRow: { display: "flex", alignItems: "center", gap: "9px" },
          cardName: { fontSize: "14px", fontWeight: 600 },
          cardTag: {
            fontSize: "10.5px",
            lineHeight: "15px",
            padding: "1px 6px",
            borderRadius: "5px",
            border: "1px solid " + LINE,
            opacity: 0.7
          },
          cardDesc: { fontSize: "12.5px", lineHeight: "19px", opacity: 0.62, margin: 0 },
          meta: { display: "flex", flexWrap: "wrap", gap: "14px", fontSize: "11.5px", opacity: 0.5, marginTop: "2px" },
          metaItem: { display: "inline-flex", gap: "5px" },
          metaKey: { opacity: 0.75 },
          current: {
            position: "absolute",
            top: "12px",
            right: "14px",
            fontSize: "10.5px",
            letterSpacing: "0.3px",
            color: ACCENT,
            opacity: 0.9
          },

          bar: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" },
          btn: {
            padding: "8px 18px",
            borderRadius: "8px",
            border: "1px solid " + ACCENT_LINE,
            background: ACCENT_SOFT,
            color: "inherit",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "opacity .15s ease"
          },
          btnOff: { opacity: 0.35, cursor: "default" },
          hint: { fontSize: "11.5px", opacity: 0.45, lineHeight: "18px" },
          warn: { fontSize: "12px", color: ACCENT, opacity: 0.85 },

          hostBox: {
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "12px 14px",
            borderRadius: "10px",
            border: "1px dashed " + LINE,
            fontSize: "11.5px",
            lineHeight: "18px",
            opacity: 0.65
          },
          code: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "11px", opacity: 0.8 }
        };

        function Tag(props) {
          return react.createElement("span", { style: S.cardTag }, props.children);
        }

        function MetaItem(props) {
          return react.createElement(
            "span",
            { style: S.metaItem },
            react.createElement("span", { style: S.metaKey }, props.k),
            react.createElement("span", null, props.v)
          );
        }

        function ColdbrewSettings() {
          var state = react.useState({ loading: true, error: null, data: null });
          var view = state[0];
          var setView = state[1];

          var pick = react.useState(null);
          var selected = pick[0];
          var setSelected = pick[1];

          var busy = react.useState(false);
          var saving = busy[0];
          var setSaving = busy[1];

          var note = react.useState(null);
          var message = note[0];
          var setMessage = note[1];

          react.useEffect(function () {
            var alive = true;
            fetch("/coldbrew/config", { headers: { accept: "application/json" } })
              .then(function (r) { return r.json(); })
              .then(function (j) {
                if (!alive) return;
                if (!j || j.ok === false) {
                  setView({ loading: false, error: (j && j.error) || "读取失败", data: null });
                  return;
                }
                setView({ loading: false, error: null, data: j });
                setSelected(j.tier);
              })
              .catch(function (e) {
                if (alive) setView({ loading: false, error: String(e && e.message ? e.message : e), data: null });
              });
            return function () { alive = false; };
          }, []);

          function save() {
            if (!selected || saving) return;
            setSaving(true);
            setMessage(null);
            fetch("/coldbrew/config", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ tier: selected })
            })
              .then(function (r) { return r.json(); })
              .then(function (j) {
                setSaving(false);
                if (!j || j.ok === false) {
                  setMessage({ kind: "err", text: (j && j.error) || "保存失败" });
                  return;
                }
                setMessage({ kind: "ok", text: "已保存 · 重启 dsh 后生效" });
                setView(function (v) {
                  if (!v.data) return v;
                  return { loading: false, error: null, data: Object.assign({}, v.data, { tier: j.tier, source: "file" }) };
                });
              })
              .catch(function (e) {
                setSaving(false);
                setMessage({ kind: "err", text: String(e && e.message ? e.message : e) });
              });
          }

          if (view.loading) {
            return react.createElement("div", { style: S.wrap },
              react.createElement("p", { style: S.sub }, "读取配置…"));
          }

          if (view.error) {
            return react.createElement("div", { style: S.wrap },
              react.createElement("h3", { style: S.title }, "冷咖啡执行核"),
              react.createElement("p", { style: S.warn }, "读不到配置：" + view.error),
              react.createElement("p", { style: S.hint }, "确认插件已加载，且 /coldbrew/config 接口可用。"));
          }

          var data = view.data;
          var tiers = data.tiers || {};
          var order = ["lite", "mid", "deep"];
          var active = data.tier;
          var dirty = selected && selected !== active;
          var host = data.host || {};

          var cards = order.map(function (id) {
            var info = tiers[id] || {};
            var on = selected === id;
            var isActive = active === id;
            return react.createElement(
              "button",
              {
                key: id,
                type: "button",
                onClick: function () { setSelected(id); setMessage(null); },
                style: Object.assign({}, S.card, on ? S.cardOn : null),
                "data-tier": id,
                "aria-pressed": on
              },
              isActive
                ? react.createElement("span", { style: S.current }, "当前生效")
                : null,
              react.createElement(
                "div",
                { style: S.cardRow },
                on ? react.createElement("span", { style: S.dot, "aria-hidden": "true" }) : null,
                react.createElement("span", { style: S.cardName }, info.label || id),
                react.createElement("span", { style: { fontSize: "11px", opacity: 0.4, fontFamily: "ui-monospace, monospace" } }, id),
                info.tagline ? react.createElement(Tag, null, info.tagline) : null
              ),
              react.createElement("p", { style: S.cardDesc }, info.desc || ""),
              react.createElement(
                "div",
                { style: S.meta },
                react.createElement(MetaItem, { k: "影响", v: info.scope || "-" }),
                react.createElement(MetaItem, { k: "回滚", v: info.revert || "-" }),
                react.createElement(MetaItem, { k: "风险", v: info.risk || "-" })
              )
            );
          });

          var hostLine = host.root
            ? "DSH 根 " + host.root
            : "未找到 DSH 安装根（deep 档打补丁时才需要）";
          var patched = Array.isArray(host.patched) ? host.patched : [];
          var rows = Array.isArray(host.rows) ? host.rows : [];

          return react.createElement(
            "div",
            { style: S.wrap },
            react.createElement(
              "div",
              { style: S.head },
              react.createElement(
                "div",
                { style: S.titleBox },
                react.createElement("h3", { style: S.title }, "冷咖啡执行核"),
                react.createElement(
                  "p",
                  { style: S.sub },
                  "选择破甲强度。改完需要重启 dsh 生效；配置文件写在 ",
                  react.createElement("span", { style: S.code }, data.file || "~/.dsh/coldbrew.json")
                )
              ),
              react.createElement(
                "span",
                { style: S.pill },
                react.createElement("span", { style: S.dot }),
                "当前 " + (tiers[active] ? tiers[active].label : active) + " · 来源 " + (data.source || "-")
              )
            ),

            react.createElement("div", { style: S.list }, cards),

            react.createElement(
              "div",
              { style: S.bar },
              react.createElement(
                "button",
                {
                  type: "button",
                  onClick: save,
                  disabled: !dirty || saving,
                  style: Object.assign({}, S.btn, (!dirty || saving) ? S.btnOff : null)
                },
                saving ? "保存中…" : dirty ? "保存并重启生效" : "已是当前档位"
              ),
              message
                ? react.createElement("span", { style: message.kind === "err" ? S.warn : S.hint }, message.text)
                : react.createElement(
                    "span",
                    { style: S.hint },
                    dirty ? "选中 " + selected + "，点保存写入配置文件。" : "点上方卡片切换档位。"
                  )
            ),

            react.createElement(
              "div",
              { style: S.hostBox },
              react.createElement("span", null, hostLine),
              react.createElement(
                "span",
                null,
                "宿主补丁 ",
                patched.length
                  ? patched.join(" + ") + "（deep 档已生效）"
                  : rows.length
                    ? rows.map(function (r) { return r.id + ":" + r.status; }).join(" · ")
                    : "未检测"
              ),
              react.createElement(
                "span",
                { style: { opacity: 0.7 } },
                "deep 档的宿主补丁是显式动作：命令行 /coldbrew apply 打，/coldbrew restore 还原。"
              )
            )
          );
        }

        function apply(ctx) {
          ctx.slots.inject("settings.section", () =>
            ctx.slots.register({
              name: "settings.section",
              id: "coldbrew",
              order: 30,
              label: () => "冷咖啡"
            }, ColdbrewSettings)
          );
        }

        exports.name = "coldbrew-dsh";
        exports.inject = inject;
        exports.apply = apply;
        return module.exports;
      }
    });
  } catch (err) {
    console.warn("[coldbrew-dsh] client runtime error:", err);
  }
})();
