import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

type SplitDirectionSetting = "vertical" | "horizontal" | "auto";
type PaneTypeSetting = "source" | "preview";

interface AutoSplitSettings {
    minSize: number;
    direction: SplitDirectionSetting;
    editorFirst: boolean;
    paneToFocus: PaneTypeSetting;
    linkPanes: boolean;
}

const DEFAULT_SETTINGS: AutoSplitSettings = {
    minSize: 1000,
    direction: "auto",
    editorFirst: true,
    paneToFocus: "source",
    linkPanes: true
};

export default class AutoSplitPlugin extends Plugin {
    settings: AutoSplitSettings;

    protected hasOpenFiles: boolean;
    protected updateHasOpenFiles() {
        try {
            this.hasOpenFiles =
                this.app.workspace.getLeavesOfType("markdown").length > 0;
        } catch (e) {
            // it's okay to fail sometimes
        }
    }

    async onload() {
        await this.loadSettings();

        this.app.workspace.onLayoutReady(() => {
            this.updateHasOpenFiles();

            this.registerEvent(
                this.app.workspace.on("file-open", async file => {
                    if (
                        this.app.workspace.activeLeaf &&
                        !this.hasOpenFiles &&
                        file
                    ) {
                        const newState = Object.assign(
                            {},
                            this.app.workspace.activeLeaf.getViewState()
                        );

                        newState.state.mode =
                            newState.state.mode === "source"
                                ? "preview"
                                : "source";

                        if (this.settings.linkPanes) {
                            newState.group = this.app.workspace.activeLeaf;
                        }

                        const rootSize = getRootContainerSize(this.app);
                        let direction = this.settings.direction;
                        if (direction === "auto") {
                            direction =
                                rootSize.width >= rootSize.height
                                    ? "vertical"
                                    : "horizontal";
                        }

                        if (
                            (direction === "vertical"
                                ? rootSize.width
                                : rootSize.height) > this.settings.minSize
                        ) {
                            const currentLeaf = this.app.workspace.activeLeaf;

                            const viewState = currentLeaf.getViewState();
                            viewState.state.mode =
                                viewState.state.mode === "preview"
                                    ? "source"
                                    : "preview";

                            const firstPane = this.settings.editorFirst
                                ? "source"
                                : "preview";

                            const newLeaf =
                                this.app.workspace.createLeafBySplit(
                                    currentLeaf,
                                    direction,
                                    viewState.state.mode === firstPane
                                );
                            newLeaf.openFile(file, viewState);

                            if (this.settings.linkPanes) {
                                currentLeaf.setGroupMember(newLeaf);
                            }

                            if (
                                viewState.state.mode ===
                                this.settings.paneToFocus
                            ) {
                                this.app.workspace.setActiveLeaf(
                                    newLeaf,
                                    true,
                                    true
                                );
                            }
                        }
                    }

                    this.updateHasOpenFiles();
                })
            );
        });

        this.addSettingTab(new AutoSplitSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class AutoSplitSettingTab extends PluginSettingTab {
    plugin: AutoSplitPlugin;

    constructor(app: App, plugin: AutoSplitPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;

        containerEl.empty();

        containerEl.createEl("h2", { text: "Auto Split Settings" });

        const { width: rootWidth, height: rootHeight } = getRootContainerSize(
            this.app
        );

        new Setting(containerEl)
            .setName("Minimum Main Area Size")
            .setDesc(
                `Only split if the main area is at least this wide or tall, depending on split direction. The main area was ${rootWidth}x${rootHeight} when you opened this tab. (default: 1000)`
            )
            .addText(text => {
                text.inputEl.type = "number";
                text.setValue(String(this.plugin.settings.minSize)).onChange(
                    async value => {
                        const valueAsNumber = Number.parseInt(value);
                        this.plugin.settings.minSize = Number.isInteger(
                            valueAsNumber
                        )
                            ? valueAsNumber
                            : this.plugin.settings.minSize;
                        await this.plugin.saveSettings();
                    }
                );
            });

        new Setting(containerEl)
            .setName("Split Direction")
            .setDesc(
                "Vertical = left/right, Horizontal = up/down. Auto chooses based on the longer side of the main area."
            )
            .addDropdown(dropdown => {
                dropdown
                    .addOptions({
                        vertical: "Vertical",
                        horizontal: "Horizontal",
                        auto: "Auto"
                    })
                    .setValue(this.plugin.settings.direction)
                    .onChange(async value => {
                        this.plugin.settings.direction =
                            value as SplitDirectionSetting;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Editor First")
            .setDesc(
                "Place the editor pane on the left in vertical splits, or the top in horizontal splits."
            )
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.editorFirst)
                    .onChange(async value => {
                        this.plugin.settings.editorFirst = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Pane To Focus")
            .setDesc("Select which pane should be focused.")
            .addDropdown(dropdown => {
                dropdown
                    .addOptions({
                        source: "Editor",
                        preview: "Preview"
                    })
                    .setValue(this.plugin.settings.paneToFocus)
                    .onChange(async value => {
                        this.plugin.settings.paneToFocus =
                            value as PaneTypeSetting;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Link Panes")
            .setDesc(
                "Link the panes so that their scroll position and open file stay synced."
            )
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.linkPanes)
                    .onChange(async value => {
                        this.plugin.settings.linkPanes = value;
                        await this.plugin.saveSettings();
                    });
            });
    }
}

function getRootContainerSize(app: App) {
    const rootContainer: HTMLElement = (app.workspace.rootSplit as any)
        .containerEl;

    if (rootContainer) {
        return {
            width: rootContainer.clientWidth,
            height: rootContainer.clientHeight
        };
    } else {
        console.warn(
            `auto-split couldn't get root container, using window size`
        );
        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    }
}
