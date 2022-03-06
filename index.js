import core from '@actions/core'
import github from '@actions/github'
import {Octokit} from '@octokit/rest'
import {publish} from 'lightlytics-publisher-core'

try {
  const apiUrl = core.getInput('ll-hostname')
  const tfWorkingDir = core.getInput('working-directory').replace(/\/$/, '')
  const tfPlan = core.getInput('plan-json');
  const tfGraph = core.getInput('tf-graph');
  const collectionToken = core.getInput('collection-token')

  const isPullRequestTriggered = github.context.payload.pull_request != null
  const source = formatGitMetadata(isPullRequestTriggered)
  const metadata = {source}

  publish({
    apiUrl,
    tfWorkingDir,
    tfPlan,
    tfGraph,
    collectionToken,
    metadata
  })
    .then(({eventId, customerId}) => {
      addCommentToPullRequest(`https://${apiUrl}/w/${customerId}/simulations/${eventId}`)
      core.setOutput('EventId', eventId);
    })
} catch (error) {
  core.setFailed(error.message);
}

function addCommentToPullRequest(link) {
  const pullRequestMessage = `An execution simulation has been generated by **Lightlytics**, to view this run impact analysis, Visit:
${link}

> _This comment was added automatically by a git workflow to help DevOps teams predict what will be the impact of the proposed change after completing this PR_`

  core.setOutput("simulation-details", pullRequestMessage)
  const octokit = new Octokit({
    auth: core.getInput('github-token')
  })

  octokit.issues.createComment({
    ...github.context.repo,
    issue_number: github.context.payload.pull_request.number,
    body: pullRequestMessage
  }).catch(err => console.log(`failed to send message on PR: ${err.message}`));
}

function formatGitMetadata(isPullRequestTriggered) {
  let source = {}

  if (isPullRequestTriggered) {
    source = {
      name: 'Github',
      type: 'Github',
      format: 'Terraform',
      branch: github.context.payload.pull_request.head.ref,
      base_branch: github.context.payload.pull_request.base.ref,
      commit_hash: github.context.payload.pull_request.head.sha,
      pr_id: github.context.payload.pull_request.number,
      repository: github.context.payload.repository.full_name,
      user_name: github.context.payload.pull_request.user.login
    }
  } else {
    source = {
      name: 'Github',
      type: 'Github',
      format: 'Terraform',
      branch: github.context.ref.replace('refs/heads/', ''),
      base_branch: github.context.payload.repository.default_branch,
      commit_hash: github.context.sha,
      pr_id: '',
      repository: github.context.payload.repository.full_name,
      user_name: github.context.actor
    }
  }
  return source
}

function getLocalsFromModule(module, locals, moduleName) {
  let blockCnt = 0;
  let currentBlockLines = "";

  module.split("\n").forEach((line) => {
    const sanitizedLine = String(line).trim();
    if (sanitizedLine.startsWith("#")) return;

    if (blockCnt > 0) {
      currentBlockLines += line;
    }

    if (blockCnt > 0 && sanitizedLine === "{") {
      blockCnt++;
    }

    if (sanitizedLine === "locals {") {
      currentBlockLines = "";
      blockCnt = 1;
    }

    if (sanitizedLine === "}" && blockCnt > 0) {
      blockCnt--;
      if (blockCnt === 0) {
        if (!locals[moduleName]) locals[moduleName] = []
        locals[moduleName].push(currentBlockLines);
      }
    }
  });
}