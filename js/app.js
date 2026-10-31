var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

;(function () {
    const store = App.store
    const tv = App.tv
    const player = App.player
    const ui = App.ui

    function zone(name, selector, options) {
        tv.define(
            name,
            () => {
                return tv.rows(ui.qsa(selector))
            },
            options,
        )
    }

    function defineZones() {
        zone("startTiles", "#startTiles .start-tile", {
            onEdge: function (dir) {
                if (dir === "down") tv.set("startLinks", 0, 0)
            },
        })

        zone("startLinks", "#startLinks .btn", {
            onEdge: function (dir) {
                if (dir === "up") tv.set("startTiles", 0, 0)
            },
        })

        zone("homeActions", "#homeActions .btn", {
            onEdge: function (dir) {
                if (dir === "down") tv.set("types", 0, 0)
            },
        })

        zone("types", "#typeList .type", {
            onEdge: function (dir) {
                if (dir === "right") tv.set("sources", 0, 0)
                else if (dir === "up") tv.set("homeActions", 0, 0)
            },
        })

        zone("sources", "#sourceList .row", {
            onEdge: function (dir) {
                if (dir === "left") tv.set("types", 0, 0)
                else if (dir === "up") tv.set("homeActions", 0, 0)
                else if (dir === "right") enterEditFromRow()
            },
        })

        let editRow = 0

        function enterEditFromRow() {
            const rows = ui.qsa("#sourceList .row.source")
            const fromRow = rows.indexOf(document.querySelector(".focused"))
            if (fromRow !== -1) showEdit(fromRow)
        }

        function showEdit(index) {
            editRow = index
            tv.set("sourceEdit", 0, 0)
        }
        tv.define(
            "sourceEdit",
            () => {
                const buttons = ui.qsa("#sourceList .edit")
                return buttons[editRow] ? [[buttons[editRow]]] : []
            },
            {
                onEdge: function (dir) {
                    const buttons = ui.qsa("#sourceList .edit")
                    if (dir === "left") tv.set("sources", editRow, 0)
                    else if (dir === "up") showEdit(Math.max(0, editRow - 1))
                    else if (dir === "down") showEdit(Math.min(buttons.length - 1, editRow + 1))
                },
            },
        )

        zone("tvActions", "#tvActions .btn", {
            onEdge: function (dir) {
                if (dir === "down") tv.set("tvSearch", 0, 0)
                else if (dir === "right") tv.set("tvSearch", 0, 0)
            },
        })

        zone("tvSearch", "#tvSearch", {
            onEdge: function (dir) {
                if (dir === "up") tv.set("tvActions", 0, 0)
                else if (dir === "left") tv.set("tvActions", 0, 0)
                else if (dir === "down") tv.set("tvCats", 0, 0)
            },
        })

        // Right opens the category under the focus, as OK does: the channels shown may be
        // another category's, or none yet, and the focus had nowhere to land.
        zone("tvCats", "#tvCats .tvcat", {
            onEdge: function (dir) {
                if (dir === "up") tv.set("tvSearch", 0, 0)
                else if (dir === "right") {
                    const category = tv.focusedElement()
                    if (category && category.dataset.group)
                        store.openTvCategory(category.dataset.group)
                }
            },
            onHold: function (element) {
                if (element.dataset.group) store.startMove("cats", element.dataset.group)
            },
        })

        zone("tvChannels", "#tvChannels .channel", {
            onEdge: function (dir) {
                if (dir === "left") {
                    const open = document.querySelector("#tvCats .tvcat.selected")
                    if (open) tv.setOn("tvCats", open)
                    else tv.set("tvCats", 0, 0)
                } else if (dir === "right") tv.set("tvPreview", 0, 0)
                else if (dir === "up") tv.set("tvSearch", 0, 0)
            },
        })

        zone("tvPreview", "#tvPreview", {
            onEdge: function (dir) {
                if (dir === "left") tv.set("tvChannels", 0, 0)
            },
        })

        zone("vodSort", "#vodSort .btn", {
            onEdge: function (dir) {
                if (dir === "right") tv.set("vodSearch", 0, 0)
                else if (dir === "down") tv.set("vodCats", 0, 0)
            },
        })

        zone("vodSearch", "#vodSearch", {
            onEdge: function (dir) {
                if (dir === "left") tv.set("vodSort", 0, 0)
                else if (dir === "down") tv.set("vodGrid", 0, 0)
            },
        })

        zone("vodCats", "#vodCats .vodcat", {
            onEdge: function (dir) {
                if (dir === "up") tv.set("vodSort", 0, 0)
                else if (dir === "right") tv.set("vodGrid", 0, 0)
            },
        })

        // The grid's top and bottom edges turn the page before they leave it.
        zone("vodGrid", "#vodGrid .poster", {
            onEdge: function (dir) {
                if (dir === "left") tv.set("vodCats", 0, 0)
                else if (dir === "up") {
                    if (App.vod.turnPage(-1)) store.focus("vodGrid", 9999, 0)
                    else tv.set("vodSearch", 0, 0)
                } else if (dir === "down") {
                    if (App.vod.turnPage(1)) store.focus("vodGrid", 0, 0)
                }
            },
        })

        zone("titleActions", "#titleActions .btn")

        zone("vodCatActions", "#vodCatActions .btn", {
            onEdge: function (dir) {
                if (dir === "down") tv.set("vodCatList", 0, 0)
                else if (dir === "right") tv.set("vodCatSearch", 0, 0)
            },
        })

        zone("vodCatSearch", "#vodCatSearch", {
            onEdge: function (dir) {
                if (dir === "left") tv.set("vodCatActions", 0, 0)
                else if (dir === "down") tv.set("vodCatList", 0, 0)
            },
        })

        zone("vodCatList", "#vodCatList .cat", {
            onEdge: function (dir) {
                if (dir === "up") tv.set("vodCatActions", 0, 0)
            },
        })

        zone("recentsSearch", "#recentsSearch", {
            onEdge: function (dir) {
                if (dir === "down") tv.set("recentsList", 0, 0)
            },
        })

        zone("recentsList", "#recentsList .channel", {
            onEdge: function (dir) {
                if (dir === "up") tv.set("recentsSearch", 0, 0)
            },
        })

        // Live, Movies, Series and (on Live) the search box are one row; Down from any of them
        // goes to the favorites themselves.
        function toFavorites() {
            const live = store.state.favTab === "live"
            const selector = live ? "#favList .channel" : "#favGrid .poster"
            if (!document.querySelector(selector)) return
            tv.set(live ? "favsList" : "favGrid", 0, 0)
        }

        zone("favTabs", "#favTabs .btn", {
            onEdge: function (dir) {
                if (dir === "right" && store.state.favTab === "live") tv.set("favsSearch", 0, 0)
                else if (dir === "down") toFavorites()
            },
        })

        zone("favsSearch", "#favsSearch", {
            onEdge: function (dir) {
                if (dir === "down") toFavorites()
                else if (dir === "left") {
                    const tabs = ui.qsa("#favTabs .btn")
                    if (tabs.length) tv.setOn("favTabs", tabs[tabs.length - 1])
                }
            },
        })

        function toOpenTab() {
            const on = document.querySelector("#favTabs .seg-btn.on")
            if (on) tv.setOn("favTabs", on)
            else tv.set("favTabs", 0, 0)
        }

        zone("favGrid", "#favGrid .poster", {
            onEdge: function (dir) {
                if (dir === "up") toOpenTab()
            },
            onHold: function (element) {
                store.startMove(store.state.favTab, element.dataset.key)
            },
        })

        zone("favsList", "#favList .channel", {
            onEdge: function (dir) {
                if (dir === "up") toOpenTab()
            },
            onHold: function (element) {
                store.startMove(
                    "live",
                    store.liveKey({ listId: element.dataset.list, url: element.dataset.url }),
                )
            },
        })

        zone("catActions", "#catActions .btn", {
            onEdge: function (dir) {
                if (dir === "down") tv.set("cats", 0, 0)
                else if (dir === "right") tv.set("catSearch", 0, 0)
            },
        })

        zone("catSearch", "#catSearch", {
            onEdge: function (dir) {
                if (dir === "up") tv.set("catActions", 0, 0)
                else if (dir === "left") tv.set("catActions", 0, 0)
                else if (dir === "down") tv.set("cats", 0, 0)
            },
        })

        zone("cats", "#catList .cat", {
            onEdge: function (dir) {
                if (dir === "up") tv.set("catSearch", 0, 0)
            },
        })

        zone("addTypes", "#addTypes .typecard")

        zone("fields", "#sourceForm input:not(.file), #sourceForm textarea, #sourceForm .pick", {
            onEdge: function (dir) {
                if (dir === "down") tv.set("formActions", 0, 0)
            },
        })

        zone("formActions", "#sourceForm .btn", {
            onEdge: function (dir) {
                if (dir === "up") tv.set("fields", 9, 0)
            },
        })

        tv.define("playerIdle", () => {
            return []
        })

        zone("overlay", "#ovActions .btn", {
            onEdge: function (dir) {
                if (dir === "up") {
                    store.setMenuFocus(false)
                    tv.set("playerIdle", 0, 0)
                }
            },
        })

        // Across the two lists the focus lands on the open category and the playing channel.
        zone("zapCats", "#zapCats .zapcat", {
            onEdge: function (dir) {
                if (dir !== "right") return
                const playing = document.querySelector("#zapChannels .zapch.playing")
                if (playing) tv.setOn("zapChannels", playing)
                else tv.set("zapChannels", 0, 0)
            },
        })

        zone("zapChannels", "#zapChannels .zapch", {
            onEdge: function (dir) {
                if (dir !== "left") return
                const open = document.querySelector("#zapCats .zapcat.selected")
                if (open) tv.setOn("zapCats", open)
                else tv.set("zapCats", 0, 0)
            },
        })

        zone("playError", "#playError .btn")

        tv.define("vodIdle", () => {
            return []
        })

        zone("vodError", "#vodError .btn")

        zone("vodMenu", "#vodMenu .btn", {
            onEdge: function (dir) {
                if (dir === "up") App.vod.closeMenu()
            },
        })

        zone("vodTracks", "#vodTracks .vod-track-opt")

        zone("vodUpNext", "#vodUpNext .btn")

        zone("showActions", "#showActions .btn", {
            onEdge: function (dir) {
                if (dir === "down") tv.set("showEpisodes", 0, 0)
            },
        })

        zone("showSeasons", "#showSeasons .season", {
            onEdge: function (dir) {
                if (dir === "right") tv.set("showEpisodes", 0, 0)
                else if (dir === "up") tv.set("showActions", 0, 0)
            },
        })

        // Left goes back to the season that is showing, not to the top of the list.
        zone("showEpisodes", "#showEpisodes .episode", {
            onEdge: function (dir) {
                if (dir === "up") tv.set("showActions", 0, 0)
                else if (dir === "left") {
                    const seasons = ui.qsa("#showSeasons .season")
                    const at = seasons.indexOf(document.querySelector("#showSeasons .selected"))
                    tv.set("showSeasons", Math.max(0, at), 0)
                }
            },
        })

        zone("confirm", "#confirm .btn")
        zone("stillWatching", "#stillWatching .btn")
    }

    function back() {
        if (store.state.confirm) {
            store.closeConfirm()
            return true
        }
        if (store.state.zapOpen) {
            store.closeZap()
            return true
        }
        if (store.state.screen === "player") {
            store.exitPlayer()
            return true
        }
        if (store.state.screen === "vodplayer") {
            const vod = App.vod
            if (vod.ui.upNext) vod.dismissUpNext()
            else if (vod.ui.trackMenu) vod.closeTracks()
            else if (vod.ui.seek) vod.cancelSeek()
            else if (vod.ui.menu) vod.closeMenu()
            else if (vod.ui.osd && !vod.ui.paused) vod.hideOsd()
            else vod.exitPlayer()
            return true
        }
        if (store.state.screen === "vodcats") {
            App.vod.closeCategories()
            return true
        }
        if (store.state.screen === "title" || store.state.screen === "show") {
            App.vod.backFromTitle()
            return true
        }
        // Adding or editing a source belongs to Sources; everything else returns to the start.
        if (store.state.screen === "edit" || store.state.screen === "add") {
            store.goHome()
            return true
        }
        if (store.state.screen !== "start") {
            store.goStart()
            return true
        }
        try {
            tizen.application.getCurrentApplication().exit()
        } catch {}
        return true
    }

    function red() {
        const element = tv.focusedElement()
        const state = store.state

        if (state.screen === "player" && state.playing) {
            const added = store.toggleFavorite(state.playing.channel, state.playing.listId)
            store.notify(added ? "Added to favourites" : "Removed from favourites")
            return
        }

        if (!element) return

        // An episode on a show's page: Red marks it watched or unwatched.
        if (state.screen === "show" && element.classList.contains("episode")) {
            const watched = App.vod.toggleWatched(App.vod.episodeByKey(element.dataset.key))
            if (watched !== null)
                store.notify(watched ? "Marked as watched" : "Marked as unwatched")
            return
        }

        // A poster: Red takes it out of Continue watching there, and is the favorite key elsewhere.
        if (element.dataset.key && element.classList.contains("poster")) {
            const vod = App.vod
            const key = element.dataset.key
            const item =
                vod.itemByKey(key) ||
                vod.state.favorites.filter((saved) => {
                    return vod.keyOf(saved) === key
                })[0]
            const browsing = state.screen === "movies" || state.screen === "series"
            if (browsing && vod.ui.category === vod.CONTINUE && vod.hasProgress(item)) {
                vod.confirmForget(item, "vodCats")
                return
            }
            const added = vod.toggleFavorite(item)
            store.notify(added ? "Added to favourites" : "Removed from favourites")
            return
        }

        if (state.screen === "home") {
            const list = element.dataset.list ? store.listById(element.dataset.list) : null
            if (!list) return
            store.askConfirm(`Delete “${list.name}”? Favourites are kept.`, () => {
                store.removeList(list.id)
                store.notify("Source deleted")
                store.goHome()
            })
            return
        }

        const url = element.dataset.url
        const listId = element.dataset.list
        if (!url) return
        const channel = store.channelByUrl(url, listId)
        if (!channel) return
        const saved = store.toggleFavorite(channel, listId)
        store.notify(saved ? "Added to favourites" : "Removed from favourites")
    }

    // Films and episodes: the arrows seek, OK and the media keys play and pause.
    function vodKey(code) {
        const vod = App.vod
        if (vod.ui.error) {
            if (code === tv.KEY.UP || code === tv.KEY.DOWN) {
                const buttons = ui.qsa("#vodError .btn")
                const index = buttons.indexOf(document.querySelector(".focused"))
                tv.set("vodError", index === 0 ? 1 : 0, 0)
                return true
            }
            return code !== tv.KEY.ENTER && code !== tv.KEY.LEFT && code !== tv.KEY.RIGHT
        }
        // The audio and subtitle menu is ordinary focus: the arrows and OK move through it.
        if (vod.ui.upNext || vod.ui.trackMenu || vod.ui.menu) {
            const navigation = [tv.KEY.UP, tv.KEY.DOWN, tv.KEY.LEFT, tv.KEY.RIGHT, tv.KEY.ENTER]
            return navigation.indexOf(code) === -1
        }
        if (code === tv.KEY.LEFT || code === tv.KEY.REWIND) vod.seekBy(-1)
        else if (code === tv.KEY.RIGHT || code === tv.KEY.FAST_FORWARD) vod.seekBy(1)
        else if (code === tv.KEY.ENTER && vod.ui.seek) vod.commitSeek()
        else if (code === tv.KEY.DOWN) vod.openMenu()
        else if (code === tv.KEY.ENTER || code === tv.KEY.PLAY_PAUSE) vod.setPaused()
        else if (code === tv.KEY.PLAY) vod.setPaused(false)
        else if (code === tv.KEY.PAUSE) vod.setPaused(true)
        else if (code === tv.KEY.STOP) vod.exitPlayer()
        return true
    }

    // Posters in a row of the favourites grid, for Up and Down while one is being moved.
    function gridColumns() {
        const posters = ui.qsa("#favGrid .poster")
        if (!posters.length) return 1
        const top = posters[0].offsetTop
        return Math.max(
            1,
            posters.filter((poster) => {
                return poster.offsetTop === top
            }).length,
        )
    }

    // While a favourite is picked up the arrows move it, OK drops it and Back cancels.
    function moveKey(code) {
        const scope = store.state.moving.scope
        const grid = scope !== "live" && scope !== "cats"
        const step = grid ? gridColumns() : 1
        if (code === tv.KEY.BACK || code === 27) store.endMove(false)
        else if (code === tv.KEY.ENTER) store.endMove(true)
        else if (code === tv.KEY.UP) store.moveBy(-step)
        else if (code === tv.KEY.DOWN) store.moveBy(step)
        else if (grid && code === tv.KEY.LEFT) store.moveBy(-1)
        else if (grid && code === tv.KEY.RIGHT) store.moveBy(1)
        return true
    }

    function onKey(code) {
        store.touched()
        if (store.state.moving) return moveKey(code)
        // The question takes every key: Back answers yes, the arrows and OK pick a button.
        if (store.state.stillWatching) {
            if (code === tv.KEY.BACK || code === 27) store.keepWatching()
            const moves = [tv.KEY.UP, tv.KEY.DOWN, tv.KEY.LEFT, tv.KEY.RIGHT, tv.KEY.ENTER]
            return moves.indexOf(code) === -1
        }
        if (store.state.screen === "vodplayer" && code !== tv.KEY.BACK && code !== 27)
            return vodKey(code)
        if (code >= 48 && code <= 57) {
            store.pushDigit(String(code - 48))
            return true
        }
        if (code >= 96 && code <= 105) {
            store.pushDigit(String(code - 96))
            return true
        }
        if (code === tv.KEY.BACK || code === 27) return store.clearDigits() ? true : back()
        if (code === tv.KEY.RED) {
            red()
            return true
        }
        if (code === tv.KEY.ENTER && store.commitDigits()) return true
        if (store.state.screen !== "player") return false

        if (code === tv.KEY.GREEN || code === tv.KEY.PREVIOUS) {
            store.swapChannel()
            return true
        }
        if (code === tv.KEY.CH_UP) {
            store.zap(1)
            return true
        }
        if (code === tv.KEY.CH_DOWN) {
            store.zap(-1)
            return true
        }

        if (store.state.zapOpen) return false

        if (code === tv.KEY.LEFT) {
            store.openZap()
            return true
        }

        if (store.state.playError) {
            if (code === tv.KEY.UP || code === tv.KEY.DOWN) {
                const buttons = ui.qsa("#playError .btn")
                const index = buttons.indexOf(document.querySelector(".focused"))
                tv.set("playError", index === 0 ? 1 : 0, 0)
                return true
            }
            return false
        }

        if (store.state.menuFocus) return false

        if (code === tv.KEY.DOWN) {
            store.setMenuFocus(true)
            tv.set("overlay", 0, 0)
            return true
        }
        if (code === tv.KEY.UP) {
            store.setMenuFocus(false)
            tv.set("playerIdle", 0, 0)
            return true
        }
        if (code === tv.KEY.ENTER) {
            store.openZap()
            return true
        }
        if (code === tv.KEY.PLAY_PAUSE) {
            player.toggle()
            return true
        }
        return false
    }

    function start() {
        store.init()
        App.vod.init()
        defineZones()
        tv.listen(onKey, { onFocus: store.focusChanged })
        ui.render()
        store.goStart()
    }

    document.addEventListener("DOMContentLoaded", start)
})()
