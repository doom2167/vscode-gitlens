'use strict';
import { QuickPickItem } from 'vscode';
import { Container } from '../../container';
import { Repository } from '../../git/gitService';
import { CommandAbortError, QuickCommandBase, QuickPickStep } from './quickCommand';
import { RepositoryQuickPickItem } from '../../quickpicks';
import { Strings } from '../../system';
import { GlyphChars } from '../../constants';

interface State {
    repos: Repository[];
    flags: string[];
}

export class FetchQuickCommand extends QuickCommandBase {
    constructor() {
        super('fetch', 'Fetch');
    }

    execute(state: State) {
        return Container.git.fetchAll(state.repos, {
            all: state.flags.includes('--all'),
            prune: state.flags.includes('--prune')
        });
    }

    async *steps(): AsyncIterableIterator<QuickPickStep> {
        const state: Partial<State> & { counter: number } = { counter: 0 };
        let oneRepo = false;

        while (true) {
            try {
                if (state.repos === undefined || state.counter < 1) {
                    const repos = [...(await Container.git.getOrderedRepositories())];

                    if (repos.length === 1) {
                        oneRepo = true;
                        state.counter++;
                        state.repos = [repos[0]];
                    }
                    else {
                        const step = this.createStep<RepositoryQuickPickItem>({
                            multiselect: true,
                            title: this.title,
                            placeholder: 'Choose repositories',
                            items: await Promise.all(
                                repos.map(r =>
                                    RepositoryQuickPickItem.create(r, undefined, {
                                        branch: true,
                                        fetched: true,
                                        status: true
                                    })
                                )
                            )
                        });
                        const selection = yield step;

                        if (!this.canMoveNext(step, state, selection)) {
                            break;
                        }

                        state.repos = selection.map(i => i.item);
                    }
                }

                const step = this.createConfirmStep<QuickPickItem & { item: string[] }>(
                    `Confirm ${this.title}${Strings.pad(GlyphChars.Dot, 2, 2)}${
                        state.repos.length === 1 ? state.repos[0].formattedName : `${state.repos.length} repositories`
                    }`,
                    [
                        {
                            label: this.title,
                            description: '',
                            detail: `Will fetch ${
                                state.repos.length === 1
                                    ? state.repos[0].formattedName
                                    : `${state.repos.length} repositories`
                            }`,
                            item: []
                        },
                        {
                            label: `${this.title} & Prune`,
                            description: '--prune',
                            detail: `Will fetch and prune ${
                                state.repos.length === 1
                                    ? state.repos[0].formattedName
                                    : `${state.repos.length} repositories`
                            }`,
                            item: ['--prune']
                        },
                        {
                            label: `${this.title} All`,
                            description: '--all',
                            detail: `Will fetch all remotes of ${
                                state.repos.length === 1
                                    ? state.repos[0].formattedName
                                    : `${state.repos.length} repositories`
                            }`,
                            item: ['--all']
                        }
                    ]
                );
                const selection = yield step;

                if (!this.canMoveNext(step, state, selection)) {
                    if (oneRepo) {
                        break;
                    }

                    continue;
                }

                state.flags = selection[0].item;

                this.execute(state as State);
                break;
            }
            catch (ex) {
                if (ex instanceof CommandAbortError) break;

                throw ex;
            }
        }
    }
}
