import requests
import boto3
import git
import os
import argparse

SCRIPT_LOCATION = os.path.join(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_LOCATION, ".."))
REPO = git.Repo(REPO_ROOT)
API_KEY_SECRET = 'ptl/monitoring/status-endpoint-api-key'

session = boto3.session.Session(profile_name='nhs-plat-ptl-dev')
secrets_manager_client = session.client('secretsmanager')


def get_api_key() -> str:
    return secrets_manager_client.get_secret_value(SecretId=API_KEY_SECRET)['SecretString']


def get_commit_id(environment_name: str, api_key: str) -> str:
    path = f"https://{environment_name}.api.service.nhs.uk/electronic-prescriptions/_status"

    headers = {'apiKey': api_key}

    commit_id = requests.get(path, headers=headers).json()['commitId']

    return commit_id


def get_tag_for_commit(r: git.Repo, commit_id: str) -> str:
    for tag in r.tags:
        if r.commit(tag) == r.commit(commit_id):
            return tag


if __name__ == "__main__":
    script = argparse.ArgumentParser(description="Identify release notes for commits between two tags")

    script.add_argument(
        "--deploy-tag",
        help="A specific tag to deploy, otherwise use the version currently deployed to internal dev",
        required=False
    )

    args = script.parse_args()

    repo = git.Repo(REPO_ROOT)

    origin = repo.remote("origin")
    origin.fetch()

    key = get_api_key()

    int_commit_id = get_commit_id("int", key)
    internal_dev_commit_id = get_commit_id("internal-dev", key)

    int_tag = get_tag_for_commit(repo, int_commit_id)
    internal_dev_tag = args.deploy_tag or get_tag_for_commit(repo, internal_dev_commit_id)

    print(f"# EPS FHIR API {internal_dev_tag}\n")

    print(f"## Changes since {int_tag}")
    tagged_commits = [repo.commit(tag) for tag in repo.tags]
    commits_in_range = repo.iter_commits(f"{int_tag}..{internal_dev_tag}")
    tagged_commits_in_range = [commit for commit in commits_in_range if commit in tagged_commits]
    for commit in tagged_commits_in_range:
        print(f"* {commit.message.splitlines()[0]}")
