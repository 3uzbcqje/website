You can create a git template that automatically creates pre-commit hooks in all repos that you clone like this:

https://pre-commit.com/#pre-commit-init-templatedir

Set the config to point to your actual .pre-commit-config.yaml file in the ~/.git-template/hooks/pre-commit file.

But I think that clobbers actual pre-commit hooks if the git repo has them, which is not ideal. #TODO Test this.

You can also install pre-commit like this:

```
pre-commit install --config /home/user/git/devopscoop/dotfiles/3uzbcqje/.pre-commit-config.yaml
```

But then you have to remember to install it every time you clone a repo...
