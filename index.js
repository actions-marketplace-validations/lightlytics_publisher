const core = require('@actions/core');
const github = require('@actions/github');
const got = require('got');
const fs = require('fs')

function removeAwsCredentials(plan) {
    delete plan['configuration']['provider_config']['aws']['expressions']['access_key']
    delete plan['configuration']['provider_config']['aws']['expressions']['secret_key']
}

try {
    const hostname = core.getInput('ll-hostname')
    const terraformPlanPath = core.getInput('plan-json');
    const plan = JSON.parse(fs.readFileSync(terraformPlanPath, 'utf8'))

    removeAwsCredentials(plan)

    const url = `https://${hostname}/api/v1/collection/terraform`
    const headers = {
        'X-Lightlytics-Token': core.getInput('collection-token')
    }

    console.log(github.context)

    const source = {
        name: 'Github',
        type: 'Github',
        format: 'Terraform',
        branch: getSafe(() => github.context.payload.pull_request.head.ref, ''),
        base_branch: getSafe(() => github.context.payload.pull_request.base.ref, ''),
        commit_hash: getSafe(() => github.context.payload.pull_request.head.sha, ''),
        pr_id: getSafe(() => github.context.payload.pull_request.number, ''),
        repository: getSafe(() => github.context.payload.repository.full_name, ''),
        user_name: getSafe(() => github.context.payload.pull_request.user.login, '')
    }

    const data = {
        plan,
        metadata: {source},
    }

    got.post(url, {
        json: data,
        responseType: 'json',
        headers
    }).then((res) => {
        core.setOutput('EventId', res.body.eventId);
    }).catch(error => core.setFailed(error.message));
} catch (error) {
    core.setFailed(error.message);
}

function getSafe(fn, defaultVal) {
    try {
        return fn();
    } catch (e) {
        return defaultVal;
    }
}