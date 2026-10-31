# Digest preview

The `Digest preview` workflow captures `/digest/2026-10-28` as one self-contained HTML file and publishes it to this repository's GitHub Pages site. The file is built in the runner's temporary directory and uploaded as a short-lived Pages artifact; it is never committed to the repository.

## Before running

The workflow is manual only. A run publishes a public HTTPS page, so get the required human approval before starting it. Configure GitHub Pages to use GitHub Actions as its source. To include the lane banner, add a repository Actions secret named `LANE_MARKER` containing the marker. The default `include_marker` input is true, and the workflow fails if that secret is empty.

## Publish the marked preview

After approval, open **Actions → Digest preview → Run workflow**, leave `include_marker` checked, and start the run. The workflow installs the locked dependencies, runs tests and type checking, starts rig on localhost, captures the digest page, verifies that the selected banner is present without printing the HTML or marker, then deploys it. The run summary and `github-pages` environment show the public URL.

## Remove the marker after review

After the reviewer has finished, run the workflow again with `include_marker` unchecked. The server process starts with `LANE_MARKER` unset; the capture check confirms the page says “no marker set” before deploying to the same Pages site. This overwrites the marked copy. Verify the public page no longer displays the lane marker before considering cleanup complete.
