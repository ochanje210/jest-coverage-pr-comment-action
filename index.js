const core = require('@actions/core')
const artifact = require('@actions/artifact')
const github = require('@actions/github')
const fs = require('fs')

const githubToken = core.getInput('repo-token', { required: true })
const coverageSummaryPath = core.getInput('coverage-summary-path') || 'coverage/coverage-summary.json'
const artifactName = core.getInput('artifact-name') || 'coverage-summary-artifact'
const artifactDownloadPath = `.github-artifacts/${artifactName}`

const artifactClient = artifact.create()

async function getPreviousCoveragePct() {
  try {
    const { downloadPath } = await artifactClient.downloadArtifact(
      artifactName, artifactDownloadPath, { createArtifactFolder: true })
  
    const artifactBuffer = fs.readFileSync(downloadPath)
    const previousSummary = JSON.parse(artifactBuffer.toString())
  
    return previousSummary.total.statements.pct
  } catch (e) {
    core.info(e.message)
    return 0
  }
}
async function getCurrentCoveragePct() {
  const buffer = fs.readFileSync(coverageSummaryPath) 
  const summary = JSON.parse(buffer.toString())
  core.info(`Found a valid coverage summary!`)

  return summary.total.statements.pct
}
async function uploadCoverageArtifact() {
  const uploadResult = await artifactClient.uploadArtifact(
    artifactName, [coverageSummaryPath], '.', { continueOnError: false })

  core.info(`Artifact upload result: ${uploadResult}`)
}
async function commentOnPR(message) {
  const octokit = github.getOctokit(githubToken)
  const pr = github.context.payload.pull_request

  if (!pr) {
    core.setFailed('pull request not exist')
    return
  }

  const owner = github.context.repo.owner
  const repo = github.context.repo.repo

  const { data: { html_url }} = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: pr.number,
    body: message
  })

  core.debug(`created PR comment URL: ${html_url}`)
  core.setOutput('comment-url', html_url)
}
function getBadge(previousCoveragePct, currentCoveragePct) {
  const diff = currentCoveragePct - previousCoveragePct
  const color = diff > 0 ? 'green' : 'red'
  core.info(`payload ${JSON.stringify(github.context.payload)}`)
  const baseBranchName = github.context.payload.base_ref
  const label = `${currentCoveragePct} (${diff}%25)%20vs%20${baseBranchName}%20${previousCoveragePct}%25`
  return `<img src="https://img.shields.io/badge/coverage-${label}-${color}" />`
}

async function run() {
  try {
    const previousCoveragePct = await getPreviousCoveragePct()
    const currentCoveragePct = await getCurrentCoveragePct()
    const badge = getBadge(previousCoveragePct, currentCoveragePct)

    core.info(`
      previous coverage pct: ${previousCoveragePct},
      current coverage pct: ${currentCoveragePct}`)

    await uploadCoverageArtifact()

    await commentOnPR(badge)

  } catch (error) {
    core.error(error)
    core.setFailed(error.message)
  }
}

run()
