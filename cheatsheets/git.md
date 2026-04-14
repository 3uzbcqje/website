# git

Lots of good tips here:

https://github.com/git-tips/tips

## Typical workflow

Either clone using SSH so you can push using your SSH key:

```
git clone git@gitlab.com:evanstucker/cheatsheets.git
```

Or if you already have the repo, ensure you're checking out the correct branch and pulling latest changes:

```
git checkout master
git pull
```

Double check your status to make sure you're starting work in the right place:

```
git status
```

If you're working with other developers, create a branch for your changes:

```
git checkout -b <branch_name>
```

Make your changes.
If you're moving/renaming or deleting files, use:

```
git rm <file>
git mv <old_file> <new_file>
```

Double check your work:

```
git diff
```

Either add the changed file(s):

```
git add <file>
```

or add all files:

```
git add -A
```

Double check your status to make sure you're not committing more than expected:

```
git status
```

Create a commit message:

```
git commit -m 'I changed things.'
```

Push it:

```
git push
```

It'll probably prompt you to set a remote tracking branch. After you do that, create a pull request (PR) in Gitlab, Github, or whatever your git hosting platform is.

## Get a file from a specific commit:

```
git checkout <commit_hash> <file>
```

## Show file from specific commit hash:

```
git show 14a9e736872caa5651673a5b07ac52175f6c02ea:components/message-item.js
```

## Ensure that your repo is squeaky clean

WARNING, this is destructive to any changes:

```
git checkout -f <branch> -- *
git clean -dfx -n
```

## Revert or rollback TO a specific commit

Note, this is different than `git revert` - I'm not trying to revert a single commit, I'm trying to go back in time to a commit and start from there.

```
git reset --hard f414f31
git reset --soft HEAD@{1}
git commit -m "Reverting to the state of the project at f414f31"
```

## Diff two branches

```
git diff branch1 branch2
```

Or to get a diff from the last common ancestor, do:

```
git diff branch1...branch2
```

## Show all changes

```
git log -p
```

## My $HOME/.gitconfig

```
[user]
	email = evans.tucker@gmail.com
	name = Evans Tucker
	signingkey = 4C5E3D2F9DA57DA7
[commit]
	gpgsign = true
```

## Search all branches for a commit hash

```
git branch -a --contains 14a9e736872caa5651673a5b07ac52175f6c02ea
```

## Convert a short hash to a full hash

```
for branch in $(git branch -r | grep -v HEAD | cut -d/ -f 2-); do git checkout $branch && git pull && git rev-parse 6b754765dc; done
```

## Search all git history

```
git log -S some_string
```

## Show current branch

```
git rev-parse --abbrev-ref HEAD
```

## Skip CI pipeline

```
git push -o ci.skip
```

## Forking a Github repo to GitLab

Create a blank Gitlab repo, then:

```
git clone git@gitlab.com:evanstucker/kube-bench.git
cd kube-bench
git remote add upstream git@github.com:aquasecurity/kube-bench.git
git pull upstream master
git push origin master
```

## Find the real CODEOWNERS

See https://stackoverflow.com/a/36090245/10443350

```
git ls-files -z | xargs -0n1 git blame -w --line-porcelain | sed -n -E 's/^author-mail <(.*)>/\1/p' | sort | uniq -c | sort -n
```

# Find repos without a CODEOWNERS file

```
for d in $(find gitlab.com -type d -name .git); do
  export repo=$(dirname "$d")
  export co_file=$(find "$repo" -name CODEOWNERS)
  if [[ -z "$co_file" ]]; then
    echo "$repo"
  fi
done
```

## Get default branch

https://stackoverflow.com/questions/28666357/how-to-get-default-git-branch

```
git remote show [your_remote] | sed -n '/HEAD branch/s/.*: //p'
```

# Delete remote branches that have been merged to the current branch (excluding some special branch names):

```
git branch -r --merged | grep '^  origin/' | grep -Ev "(^\*|^\+|master|main|dev|release)" | xargs --no-run-if-empty git branch -d -r
```

# Search for code in all branches

https://stackoverflow.com/questions/15292391/is-it-possible-to-perform-a-grep-search-in-all-the-branches-of-a-git-project

```
git grep <regexp> $(git rev-list --all)
```

# Generate a patch

```
diff -urN downstream upstream > update.patch
# Apply the patch
patch -p1 -d downstream < update.patch
```
