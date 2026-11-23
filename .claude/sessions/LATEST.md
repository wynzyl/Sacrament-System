# Latest Session: 2026-11-19 08:24

**In progress**
- Feature `specs/001-upgrade-tech-stack` has its spec clarified and is ready for `/speckit-plan`. No plan, tasks, or code changes yet. `specs/` is uncommitted and on `main`.

**Open questions / blockers**
- The Dockerfile isn't in this repo. Where is the image built?
- Is pm2 still used? Remove it if neither target uses it.
- Downtime or maintenance window for the rollout (deferred to planning).

**Next steps**
1. Create the branch `001-upgrade-tech-stack`. The constitution forbids commits to `main`.
2. Commit `specs/001-upgrade-tech-stack/`.
3. Run `/speckit-plan`.
4. Run `/speckit-tasks`, then `/speckit-implement`, starting with the regression test suite.
