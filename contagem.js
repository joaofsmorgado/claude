(function () {
    var webhookURL = window.webhookURL || 'COLOCA_AQUI_O_TEU_WEBHOOK_DISCORD';
    var SCRIPT_NS = 'defesa_disponivel_bot_compat';
    var DIALOG_ID = 'defesa_disponivel_dialog';

    try { $(document).off('.' + SCRIPT_NS); } catch (e) {}
    try { Dialog.close(); } catch (e) {}
    try { delete window.villagesTroopsCounter; } catch (e) { window.villagesTroopsCounter = undefined; }

    class VillagesTroopsCounter {
        static translations() {
            return {
                en_US: {
                    title: 'Home and Scavenging Troops Counter',
                    subtitle: 'Defense summary',
                    home: 'Home',
                    scavenging: 'Scavenging',
                    total: 'Total',
                    defensiveTotal: 'Total Defensive Troops',
                    group: 'Current group',
                    player: 'Player',
                    server: 'Server',
                    refresh: 'Refresh',
                    sendDiscord: 'Send to Discord',
                    noGroup: 'All',
                    copy: 'Copy',
                    bbCopied: 'BBCode copied!',
                    summaryTotal: 'Total Summary',
                    homePlusScavenge: 'Home + Scavenging',
                    atHomeOnly: 'At home',
                    exportTroops: 'Export Troop Count',
                    errorMessages: {
                        premiumRequired: 'Error. A premium account is required to run this script!',
                        errorFetching: 'An error occurred while trying to fetch the following URL:',
                        missingSavengeMassScreenElement: 'Could not locate ScavengeMassScreen in the mass scavenging page.',
                        invalidWebhook: 'Invalid or missing Discord webhook.',
                        troopsReadError: 'Could not read troop data.',
                        invalidWorldConfig: 'Invalid world configuration.'
                    },
                    successMessage: 'Loaded successfully!',
                    loadingMessage: 'Loading...',
                    loadingWorldConfigMessage: 'Loading world config...',
                    credits: 'Defesa Disponível by JDi4s'
                },
                pt_PT: {
                    title: 'Contagem de Tropas em Casa e em Buscas',
                    subtitle: 'Resumo Defensivo',
                    home: 'Em Casa',
                    scavenging: 'Em Buscas',
                    total: 'Total',
                    defensiveTotal: 'Total de Tropa Defensiva',
                    group: 'Grupo Atual',
                    player: 'Jogador',
                    server: 'Servidor',
                    refresh: 'Atualizar',
                    sendDiscord: 'Enviar para o Ticket',
                    noGroup: 'Todos',
                    copy: 'Copiar',
                    bbCopied: 'BBCode copiado!',
                    summaryTotal: 'Resumo Total',
                    homePlusScavenge: 'Casa + Busca',
                    atHomeOnly: 'Em Casa',
                    exportTroops: 'Exportar Contagem de Tropas',
                    errorMessages: {
                        premiumRequired: 'Erro. É necessário possuir conta premium para correr este script!',
                        errorFetching: 'Ocorreu um erro ao tentar carregar o seguinte URL:',
                        missingSavengeMassScreenElement: 'Ocorreu um erro ao tentar localizar o elemento ScavengeMassScreen dentro da página de buscas em massa.',
                        invalidWebhook: 'Webhook do Discord inválido ou não definido.',
                        troopsReadError: 'Não foi possível ler os dados das tropas.',
                        invalidWorldConfig: 'Configuração do mundo inválida.'
                    },
                    successMessage: 'Carregado com sucesso!',
                    loadingMessage: 'A carregar...',
                    loadingWorldConfigMessage: 'A carregar configurações do mundo...',
                    credits: 'Defesa Disponível by JDi4s e Modificado por João Morgado'
                }
            };
        }

        constructor() {
            const allTranslations = VillagesTroopsCounter.translations();
            this.UserTranslation = allTranslations[game_data.locale] || allTranslations.en_US;

            this.availableUnits = Array.isArray(game_data.units) ? [...game_data.units] : [];
            const militiaIndex = this.availableUnits.indexOf('militia');
            if (militiaIndex !== -1) this.availableUnits.splice(militiaIndex, 1);

            this.worldConfig = null;
            this.isScavengingWorld = false;
            this.worldConfigFileName = `worldConfigFile_${game_data.world}`;
            this.lastTroopsObj = null;
        }

        async init() {
            if (!game_data.features.Premium.active) {
                UI.ErrorMessage(this.UserTranslation.errorMessages.premiumRequired);
                return;
            }

            await this.#initWorldConfig();
            await this.#createUI();
        }

        async #initWorldConfig() {
            let worldConfig = localStorage.getItem(this.worldConfigFileName);

            if (worldConfig === null) {
                UI.InfoMessage(this.UserTranslation.loadingWorldConfigMessage);
                worldConfig = await this.#getWorldConfig();
            }

            this.worldConfig =
                typeof worldConfig === 'string'
                    ? $.parseXML(worldConfig)
                    : worldConfig;

            try {
                this.isScavengingWorld =
                    this.worldConfig
                        .getElementsByTagName('config')[0]
                        .getElementsByTagName('game')[0]
                        .getElementsByTagName('scavenging')[0]
                        .textContent.trim() === '1';
            } catch (e) {
                UI.ErrorMessage(this.UserTranslation.errorMessages.invalidWorldConfig);
                throw e;
            }
        }

        async #getWorldConfig() {
            const xml = this.#fetchHtmlPage('/interface.php?func=get_config');
            const xmlString =
                typeof xml === 'string'
                    ? xml
                    : new XMLSerializer().serializeToString(xml);

            localStorage.setItem(this.worldConfigFileName, xmlString);
            await this.#waitMilliseconds(Date.now(), 200);
            return xmlString;
        }

        async #waitMilliseconds(lastRunTime, milliseconds = 0) {
            await new Promise(res => {
                setTimeout(res, Math.max((lastRunTime || 0) + milliseconds - Date.now(), 0));
            });
        }

        #generateUrl(screen, mode = null, extraParams = {}) {
            let url = `/game.php?village=${game_data.village.id}&screen=${screen}`;
            if (mode !== null) url += `&mode=${mode}`;

            $.each(extraParams, function (key, value) {
                url += `&${key}=${value}`;
            });

            if (game_data.player.sitter !== "0") url += "&t=" + game_data.player.id;
            return url;
        }

        #initTroops() {
            const troops = {};
            this.availableUnits.forEach(function (unit) {
                troops[unit] = 0;
            });
            return troops;
        }

        #fetchHtmlPage(url) {
            let tempData = null;
            const self = this;

            $.ajax({
                async: false,
                url: url,
                type: 'GET',
                success: function (data) {
                    tempData = data;
                },
                error: function () {
                    UI.ErrorMessage(`${self.UserTranslation.errorMessages.errorFetching} ${url}`);
                }
            });

            return tempData;
        }

        async #getTroopsScavengingWorldObj() {
            const troopsObj = {
                villagesTroops: this.#initTroops(),
                scavengingTroops: this.#initTroops()
            };

            let currentPage = 0;
            let lastRunTime = null;

            do {
                const scavengingObject = await getScavengeMassScreenJson(this, currentPage, lastRunTime);
                if (!scavengingObject) return troopsObj;
                if (scavengingObject.length === 0) break;

                lastRunTime = Date.now();

                $.each(scavengingObject, function (_, villageData) {
                    $.each(villageData.unit_counts_home || {}, function (key, value) {
                        if (key !== 'militia' && typeof troopsObj.villagesTroops[key] !== 'undefined') {
                            troopsObj.villagesTroops[key] += value;
                        }
                    });

                    $.each(villageData.options || [], function (_, option) {
                        if (option.scavenging_squad !== null) {
                            $.each(option.scavenging_squad.unit_counts || {}, function (key, value) {
                                if (key !== 'militia' && typeof troopsObj.scavengingTroops[key] !== 'undefined') {
                                    troopsObj.scavengingTroops[key] += value;
                                }
                            });
                        }
                    });
                });

                currentPage++;
            } while (true);

            return troopsObj;

            async function getScavengeMassScreenJson(currentObj, currentPage = 0, lastRunTime = 0) {
                await currentObj.#waitMilliseconds(lastRunTime, 200);
                const html = currentObj.#fetchHtmlPage(
                    currentObj.#generateUrl('place', 'scavenge_mass', { page: currentPage })
                );

                if (!html) return false;

                const matches = html.match(/ScavengeMassScreen[\s\S]*?(,\n *\[.*?\}{0,3}\],\n)/);
                if (!matches || matches.length <= 1) {
                    UI.ErrorMessage(currentObj.UserTranslation.errorMessages.missingSavengeMassScreenElement);
                    return false;
                }

                let json = matches[1];
                json = json.substring(json.indexOf('['));
                json = json.substring(0, json.length - 2);

                try {
                    return JSON.parse(json);
                } catch (e) {
                    return false;
                }
            }
        }

        async #getTroopsNonScavengingWorldObj() {
            const troopsObj = {
                villagesTroops: this.#initTroops(),
                scavengingTroops: this.#initTroops()
            };

            let currentPage = 0;
            let lastRunTime = Date.now();

            await this.#setMaxLinesPerPage('overview_villages', 'units', 1000);
            await this.#waitMilliseconds(lastRunTime, 200);

            let lastVillageId = null;

            do {
                lastRunTime = Date.now();

                const rawPage = this.#fetchHtmlPage(
                    this.#generateUrl('overview_villages', 'units', { page: currentPage })
                );
                if (!rawPage) break;

                const overviewTroopsPage = $.parseHTML(rawPage);
                const troopsTable = $(overviewTroopsPage).find('#units_table tbody');
                if (!troopsTable.length) break;

                const lastVillageIdTemp = $(troopsTable).find('span').eq(0).attr('data-id');
                if (!lastVillageIdTemp) break;

                if (lastVillageId !== null && lastVillageId === lastVillageIdTemp) break;
                lastVillageId = lastVillageIdTemp;

                const currentObj = this;
                $.each(troopsTable, function (_, tbodyObj) {
                    const villageTroops = $(tbodyObj).find('tr').eq(0);
                    const villageTroopsLine = $(villageTroops).find('td:gt(1)');
                    let c = 0;

                    $.each(currentObj.availableUnits, function (_, value) {
                        troopsObj.villagesTroops[value] += parseInt(villageTroopsLine.eq(c).text().trim(), 10) || 0;
                        c++;
                    });
                });

                currentPage++;
                await this.#waitMilliseconds(lastRunTime, 200);
            } while (true);

            return troopsObj;
        }

        async #setMaxLinesPerPage(screen, mode, value) {
            await new Promise(res => setTimeout(res, 200));

            const form = document.createElement("form");
            form.method = "POST";
            form.action = "#";

            $.each({ page_size: value, h: game_data.csrf }, function (key, value) {
                const input = document.createElement('input');
                input.name = key;
                input.value = value;
                form.appendChild(input);
            });

            const dataString = $(form).serialize();

            $.ajax({
                type: 'POST',
                url: this.#generateUrl(screen, mode, { action: 'change_page_size', type: 'all' }),
                data: dataString,
                async: false
            });
        }

        #getGroupsObj() {
            const html = $.parseHTML(
                this.#fetchHtmlPage(this.#generateUrl('overview_villages', 'groups', { type: 'static' }))
            );

            let groups = $(html).find('.vis_item').find('a,strong');
            const groupsArr = {};

            if ($(groups).length > 0) {
                $.each(groups, function (_, group) {
                    const val = $(group).text().trim();
                    groupsArr[group.getAttribute('data-group-id')] = val.substring(1, val.length - 1);
                });
            } else {
                groups = $(html).find('.vis_item select option');
                $.each(groups, function (_, group) {
                    groupsArr[(new URLSearchParams($(group).val())).get('group')] = $(group).text().trim();
                });
            }

            return groupsArr;
        }

        #buildTotalTroopsObj(troopsObj) {
            const merged = {};
            $.each(troopsObj.villagesTroops, function (key, value) {
                merged[key] = value + (troopsObj.scavengingTroops[key] || 0);
            });
            return merged;
        }

        #buildDiscordDefensiveTroops(totalTroops) {
            return {
                spear: totalTroops.spear || 0,
                sword: totalTroops.sword || 0,
                spy: totalTroops.spy || 0,
                heavy: totalTroops.heavy || 0,
                catapult: totalTroops.catapult || 0,
                knight: totalTroops.knight || 0
            };
        }

        #buildVisibleDefensiveTroops(totalTroops) {
            return {
                spear: totalTroops.spear || 0,
                sword: totalTroops.sword || 0,
                archer: totalTroops.archer || 0,
                spy: totalTroops.spy || 0,
                heavy: totalTroops.heavy || 0,
                catapult: totalTroops.catapult || 0,
                knight: totalTroops.knight || 0
            };
        }

        #getCurrentGroupName() {
            const groups = this.#getGroupsObj();
            return (game_data.group_id && groups[game_data.group_id]) || this.UserTranslation.noGroup;
        }

        #getServerTime() {
            return $('#serverDate').text() + ' ' + $('#serverTime').text();
        }

        #formatNumber(value) {
            return new Intl.NumberFormat('pt-PT').format(Number(value || 0));
        }

        #getUnitLabel(key) {
            const unitLabel = {
                spear: 'Lanceiros',
                sword: 'Espadachins',
                axe: 'Vikings',
                archer: 'Arqueiros',
                spy: 'Batedores',
                light: 'Cavalaria Leve',
                marcher: 'Arqueiros Montados',
                heavy: 'Cavalaria Pesada',
                ram: 'Aríetes',
                catapult: 'Catapultas',
                knight: 'Paladinos',
                snob: 'Nobres'
            };
            return unitLabel[key] || '';
        }

        #getTroopsBBCode(totalTroops) {
            const currentGroup = this.#getCurrentGroupName();
            let bbCode = `[b]Contagem de Tropas (${this.#getServerTime()})[/b]\n`;
            bbCode += `[b]Grupo Atual:[/b] ${currentGroup}\n\n`;

            for (let [key, value] of Object.entries(totalTroops)) {
                bbCode += `[unit]${key}[/unit] [b]${this.#formatNumber(value)}[/b] ${this.#getUnitLabel(key)}\n`;
            }

            return bbCode;
        }

        #sendToDiscordBotCompatible(discordDefensiveTroops) {
            const playerName = game_data.player.name;
            const currentGroup = this.#getCurrentGroupName();

            if (typeof webhookURL !== 'string' || !webhookURL.startsWith('https://discord.com/api/webhooks/')) {
                alert("❌ Webhook inválido ou não definido. Por favor insere o teu webhook no botão da quickbar.");
                return;
            }

            const embedData = {
                content: `**Resumo da tropa defensiva do jogador:** ${playerName} - **(Atualizado em: ${this.#getServerTime()})**\n<br>`,
                embeds: [
                    {
                        title: "**🛡️ TOTAL**",
                        fields: [
                            { name: "🗂️ **Grupo Atual**", value: currentGroup, inline: false },
                            { name: "<:lanceiro:1368839513891409972> **Lanceiros**", value: `${discordDefensiveTroops.spear || 0}`, inline: true },
                            { name: "<:espadachim:1368839514746785844> **Espadachins**", value: `${discordDefensiveTroops.sword || 0}`, inline: true },
                            { name: "<:batedor:1368839512423137404> **Batedores**", value: `${discordDefensiveTroops.spy || 0}`, inline: true },
                            { name: "<:pesada:1368839517997498398> **Cavalaria Pesada**", value: `${discordDefensiveTroops.heavy || 0}`, inline: true },
                            { name: "<:catapulta:1368839516441280573> **Catapultas**", value: `${discordDefensiveTroops.catapult || 0}`, inline: true },
                            { name: "<:paladino:1368332901728391319> **Paladinos**", value: `${discordDefensiveTroops.knight || 0}`, inline: true }
                        ]
                    }
                ]
            };

            $.ajax({
                url: webhookURL,
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(embedData),
                success: function () {
                    alert("Operação efetuada com sucesso - Defesa partilhada com a Liderança no Ticket!");
                },
                error: function () {
                    alert("Houve um erro ao enviar os dados para o Discord.");
                }
            });
        }

        async #createUI() {
            UI.InfoMessage(this.UserTranslation.loadingMessage);

            const troopsObj = this.isScavengingWorld
                ? await this.#getTroopsScavengingWorldObj()
                : await this.#getTroopsNonScavengingWorldObj();

            if (!troopsObj || !troopsObj.villagesTroops) {
                UI.ErrorMessage(this.UserTranslation.errorMessages.troopsReadError);
                return;
            }

            this.lastTroopsObj = troopsObj;

            const totalTroops = this.#buildTotalTroopsObj(troopsObj);
            const discordDefensiveTroops = this.#buildDiscordDefensiveTroops(totalTroops);
            const visibleDefensiveTroops = this.#buildVisibleDefensiveTroops(totalTroops);
            const bbCode = this.#getTroopsBBCode(totalTroops);
            const groups = this.#getGroupsObj();
            const currentGroupName = this.#getCurrentGroupName();
            const serverTime = this.#getServerTime();
            const t = this.UserTranslation;
            const availableUnits = this.availableUnits;
            const isScavengingWorld = this.isScavengingWorld;
            const playerName = game_data.player.name;
            const worldName = game_data.world;

            const groupsHtml = (function buildGroupsHtml() {
                let html = '';
                $.each(groups, function (groupId, group) {
                    const selected = String(game_data.group_id) === String(groupId) ? 'selected' : '';
                    html += `<option value="${groupId}" ${selected}>${group}</option>`;
                });
                return `<select id="dd-group-select" onchange="villagesTroopsCounter.changeGroup(this)">${html}</select>`;
            })();

            const troopsHeader = (function getTroopsHeader() {
                let html = `<tr><th class="center" style="width:0px;"></th>`;
                $.each(availableUnits, function (_, value) {
                    html += `<th style="text-align:center" width="35"><a href="#" class="unit_link" data-unit="${value}"><img src="https://dspt.innogamescdn.com/asset/2a2f957f/graphic/unit/unit_${value}.png"></a></th>`;
                });
                html += `</tr>`;
                return html;
            })();

            function getTroopsLine(translation, troopsObjLine, type = null) {
                const troops = type === null ? troopsObjLine : (() => {
                    const merged = {};
                    $.each(troopsObjLine.villagesTroops, function (key, value) {
                        merged[key] = value + (troopsObjLine.scavengingTroops[key] || 0);
                    });
                    return merged;
                })();

                let html = `<tr><td class="center" style="text-wrap: nowrap;">${translation}</td>`;
                $.each(troops, function (key, value) {
                    html += `<td class="center" data-unit="${key}">${value}</td>`;
                });
                html += `</tr>`;
                return html;
            }

            function renderDefCard(unit, value) {
                const labels = {
                    spear: 'Lanceiros',
                    sword: 'Espadas',
                    archer: 'Arqueiros',
                    spy: 'Batedores',
                    heavy: 'Pesadas',
                    catapult: 'Catas',
                    knight: 'Paladino'
                };

                return `
                    <div class="dd-unit-card">
                        <img src="https://dspt.innogamescdn.com/asset/2a2f957f/graphic/unit/unit_${unit}.png" alt="${unit}">
                        <div class="dd-unit-value">${new Intl.NumberFormat('pt-PT').format(Number(value || 0))}</div>
                        <div class="dd-unit-name">${labels[unit] || unit}</div>
                    </div>
                `;
            }

            const html = `
<div id="dd-root">
    <div class="dd-shell">
        <div class="dd-header">
            <div class="dd-header-left">
                <img src="https://i.pinimg.com/originals/64/6e/71/646e7164adf368769f5300570f641267.gif" width="100" height="100"></img>
                <div class="dd-kicker">Tribal Wars</div>
                <h3>${t.title}</h3>
                <div class="dd-sub">${t.subtitle}</div>
            </div>
            <div class="dd-header-right">
                <div class="dd-stamp">${serverTime}</div>
            </div>
        </div>

        <div class="dd-topbar">
            <div class="dd-meta">
                <div class="dd-pill">
                    <span class="dd-pill-label">${t.group}</span>
                    <strong>${currentGroupName}</strong>
                </div>
                <div class="dd-pill">
                    <span class="dd-pill-label">${t.player}</span>
                    <strong>${playerName}</strong>
                </div>
                <div class="dd-pill">
                    <span class="dd-pill-label">${t.server}</span>
                    <strong>${worldName}</strong>
                </div>
            </div>

            <div class="dd-actions">
                ${groupsHtml}
                <button id="dd-refresh" class="dd-btn dd-btn-secondary">${t.refresh}</button>
                <button id="dd-send-discord" class="dd-btn dd-btn-primary">${t.sendDiscord}</button>
            </div>
        </div>

        <div class="dd-grid" style="padding-top:18px;">
            <div class="dd-panel dd-panel-large">
                <div class="dd-panel-head">
                    <h4>${t.summaryTotal}</h4>
                    <span class="dd-panel-note">${isScavengingWorld ? t.homePlusScavenge : t.atHomeOnly}</span>
                </div>
                <div class="dd-table-wrap">
                    <table id="support_sum" class="vis overview_table dd-table-modern" width="100%">
                        <thead>
                            ${troopsHeader}
                        </thead>
                        <tbody>
                            ${isScavengingWorld ? getTroopsLine(t.home, troopsObj.villagesTroops) : ''}
                            ${isScavengingWorld ? getTroopsLine(t.scavenging, troopsObj.scavengingTroops) : ''}
                            ${getTroopsLine(t.total, troopsObj, 1)}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="dd-panel">
                <div class="dd-panel-head">
                    <h4>${t.defensiveTotal}</h4>
                </div>
                <div class="dd-def-grid">
                    ${renderDefCard('spear', visibleDefensiveTroops.spear)}
                    ${renderDefCard('sword', visibleDefensiveTroops.sword)}
                    ${game_data.units.includes('archer') ? renderDefCard('archer', visibleDefensiveTroops.archer) : ''}
                    ${renderDefCard('spy', visibleDefensiveTroops.spy)}
                    ${renderDefCard('heavy', visibleDefensiveTroops.heavy)}
                    ${renderDefCard('catapult', visibleDefensiveTroops.catapult)}
                    ${game_data.units.includes('knight') ? renderDefCard('knight', visibleDefensiveTroops.knight) : ''}
                </div>
            </div>
        </div>

        <div class="dd-panel dd-panel-bb">
            <div class="dd-panel-head">
                <h4>${t.exportTroops}</h4>
                <button id="dd-copy-bbcode" class="dd-btn dd-btn-secondary">${t.copy}</button>
            </div>
            <textarea readonly id="dd-bbcode-area">${bbCode.trim()}</textarea>
        </div>

        <div class="dd-footer">${t.credits}</div>
    </div>
</div>

<style>
.popup_box_content {
    min-width: 980px;
    background: transparent !important;
}
.mds .popup_box_content {
    min-width: unset !important;
}

#dd-root {
    color: #f3e9d2;
    font-family: Arial, sans-serif;
}

#dd-root .dd-shell {
    background: linear-gradient(180deg, rgba(34,24,17,.96) 0%, rgba(23,16,11,.98) 100%);
    border: 1px solid #6d5231;
    border-radius: 18px;
    box-shadow: 0 18px 45px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.04);
    overflow: hidden;
}

#dd-root .dd-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding: 20px 22px;
    background: linear-gradient(135deg, rgba(88,57,29,.95) 0%, rgba(59,37,20,.97) 100%);
    border-bottom: 1px solid #7c5b36;
}

#dd-root .dd-kicker {
    color: #d6b98a;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .12em;
    margin-bottom: 6px;
}

#dd-root h3 {
    margin: 0;
    font-size: 24px;
    color: #fff3da;
}

#dd-root .dd-sub {
    margin-top: 6px;
    color: #d9c4a0;
    font-size: 12px;
}

#dd-root .dd-stamp {
    background: rgba(0,0,0,.18);
    border: 1px solid rgba(255,255,255,.08);
    color: #f6e7c9;
    padding: 10px 12px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 12px;
    white-space: nowrap;
}

#dd-root .dd-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 16px 22px;
    background: rgba(0,0,0,.18);
    border-bottom: 1px solid rgba(255,255,255,.05);
}

#dd-root .dd-meta {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

#dd-root .dd-pill {
    background: linear-gradient(180deg, #3a2819 0%, #2b1d12 100%);
    border: 1px solid #6b4f31;
    border-radius: 999px;
    padding: 8px 12px;
    color: #f2e1c0;
    display: flex;
    gap: 8px;
    align-items: center;
}

#dd-root .dd-pill-label {
    color: #c9ae80;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .04em;
}

#dd-root .dd-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
}

#dd-root .dd-actions select {
    height: 38px;
    border-radius: 10px;
    border: 1px solid #6d5231;
    background: #21160e;
    color: #f6e8cb;
    padding: 0 12px;
    min-width: 220px;
    outline: none;
}

#dd-root .dd-btn {
    height: 38px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid #7d5b33;
    cursor: pointer;
    font-weight: 700;
    transition: .15s ease;
}

#dd-root .dd-btn:hover {
    transform: translateY(-1px);
    filter: brightness(1.04);
}

#dd-root .dd-btn-secondary {
    background: linear-gradient(180deg, #4d3723 0%, #372517 100%);
    color: #f5e6c8;
}

#dd-root .dd-btn-primary {
    background: linear-gradient(180deg, #b8863b 0%, #8d6228 100%);
    color: #fff8ea;
    border-color: #c89b53;
}

#dd-root .dd-grid {
    display: grid;
    grid-template-columns: 1.4fr .9fr;
    gap: 16px;
    padding: 18px 22px;
}

#dd-root .dd-panel {
    background: linear-gradient(180deg, #2d1f14 0%, #21160e 100%);
    border: 1px solid #644a2d;
    border-radius: 16px;
    padding: 16px;
}

#dd-root .dd-panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
}

#dd-root .dd-panel-head h4 {
    margin: 0;
    color: #fff1d5;
    font-size: 16px;
}

#dd-root .dd-panel-note {
    color: #c8ae82;
    font-size: 11px;
    text-transform: uppercase;
}

#dd-root .dd-table-wrap {
    overflow-x: auto;
    border-radius: 12px;
}

#dd-root .dd-table-modern {
    border-radius: 12px;
    overflow: hidden;
}

#dd-root .dd-table-modern th {
    background: linear-gradient(180deg, #6b4a26 0%, #53381d 100%) !important;
}

#dd-root .dd-table-modern td {
    background: #2a1d13 !important;
    color: #f6e8cb;
}

#dd-root .dd-def-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(95px, 1fr));
    gap: 10px;
}

#dd-root .dd-unit-card {
    background: linear-gradient(180deg, #3a2819 0%, #2a1d13 100%);
    border: 1px solid #62492c;
    border-radius: 14px;
    padding: 12px 8px;
    text-align: center;
}

#dd-root .dd-unit-card img {
    width: 22px;
    height: 22px;
    display: block;
    margin: 0 auto 8px;
}

#dd-root .dd-unit-value {
    font-size: 15px;
    font-weight: 800;
    color: #fff1d7;
}

#dd-root .dd-unit-name {
    margin-top: 4px;
    font-size: 11px;
    color: #cbb186;
}

#dd-root .dd-panel-bb {
    margin: 0 22px 18px;
}

#dd-root #dd-bbcode-area {
    width: 100%;
    min-height: 130px;
    resize: vertical;
    box-sizing: border-box;
    border-radius: 12px;
    border: 1px solid #644a2d;
    background: #17100b;
    color: #f1e2c6;
    padding: 12px;
    font-family: Consolas, monospace;
}

#dd-root .dd-footer {
    padding: 0 22px 18px;
    color: #a98d64;
    font-size: 11px;
}

@media (max-width: 980px) {
    .popup_box_content {
        min-width: unset;
    }

    #dd-root .dd-grid {
        grid-template-columns: 1fr;
    }

    #dd-root .dd-header,
    #dd-root .dd-topbar {
        flex-direction: column;
        align-items: stretch;
    }
}
</style>
`;

            Dialog.show(DIALOG_ID, html, Dialog.close());
            $('#popup_box_' + DIALOG_ID).css('width', 'unset');

            $(document).off('click.' + SCRIPT_NS, '#dd-send-discord');
            $(document).on('click.' + SCRIPT_NS, '#dd-send-discord', () => {
                this.#sendToDiscordBotCompatible(discordDefensiveTroops);
            });

            $(document).off('click.' + SCRIPT_NS, '#dd-refresh');
            $(document).on('click.' + SCRIPT_NS, '#dd-refresh', async () => {
                try { Dialog.close(); } catch (e) {}
                await this.#createUI();
            });

            $(document).off('click.' + SCRIPT_NS, '#dd-copy-bbcode');
            $(document).on('click.' + SCRIPT_NS, '#dd-copy-bbcode', async () => {
                const text = $('#dd-bbcode-area').val();
                try {
                    await navigator.clipboard.writeText(text);
                    UI.SuccessMessage(t.bbCopied, 1500);
                } catch (e) {
                    $('#dd-bbcode-area').trigger('select');
                }
            });

            UI.SuccessMessage(t.successMessage, 500);
        }

        async changeGroup(obj) {
            const groupId = obj.value;
            this.#fetchHtmlPage(this.#generateUrl('overview_villages', null, { group: groupId }));
            game_data.group_id = groupId;
            await this.#createUI();
        }
    }

    window.villagesTroopsCounter = new VillagesTroopsCounter();
    window.villagesTroopsCounter.init();
})();
