______________________________________________________________________

## title: "Bash" draft: false

## Shitty bash port scanner

Use this in a pinch when you can't install nmap.

```bash
host=tired-devops-parity-rpc
port=8545
(echo > "/dev/tcp/${host}/${port}") &> /dev/null && echo "${port} is open"
```

## Kill defunct processes (or rather, kill their parents)

Dark. Useful?

```bash
parents_of_dead_kids=$(ps -ef | grep [d]efunct | awk '{print $3}' | sort | uniq | egrep -v '^1$'); echo "$parents_of_dead_kids" | xargs kill
```

## Using timeout to run an export function

I found a better way to check status of rollouts in Kubernetes, but this code is still interesting. TIL how to export a function and use timeout kind of elegantly.

```bash
#!/bin/bash

export TIMEOUT=120
export POLL_INTERVAL=5

function verify_loop {
  echo "INFO: Checking pod state every ${POLL_INTERVAL} seconds for ${TIMEOUT} seconds."
  while true; do
    if kubectl get pods | sed 1d | grep -q -vE "(Running|Completed)"; then
      echo -n "."
      sleep $POLL_INTERVAL
    else
      echo
      exit 0
    fi
  done
}
export -f verify_loop

timeout $TIMEOUT bash -c verify_loop

if [[ $? -ne 0 ]]; then
  echo
  echo "ERROR: Not all pods are in Running state."
  exit 1
else
  echo
  echo "INFO: Success, all pods are in a good state."
fi

```

# READLINE: the library that handles reading input when using an interactive shell

These are the most useful commands from `man bash` under the "READLINE" section.

Note that:

- `C-x` means *hold* the CTRL key, press x, then release the CTRL key.
- `M-x` means press the Escape key, release it, then press x.
- Readline commands may be given numeric arguments, which normally act as a repeat count. Sometimes, however, it is the sign of the argument that is significant. Passing a negative argument to a command that acts in the forward direction (e.g., kill-line) causes that command to act in a backward direction. Commands whose behavior with arguments deviates from this are noted below.

## Searching

Type `C-r` to start a reverse incremental search through your command history, then start typing part of the command you're looking for. Type `C-r` to continue searching backwards through history for commands that have the search string in them.

## Commands for Moving

```
# I use Home and End keys for these, but if the keyboard or device doesn't have those keys, use this:
beginning-of-line (C-a)
       Move to the start of the current line.
end-of-line (C-e)
       Move to the end of the line.

# I use M-RIGHTARROW and M-LEFTARROW here, but if there aren't arrow keys, use these:
forward-word (M-f)
       Move forward to the end of the next word.  Words are composed of alphanumeric characters (letters and digits).
backward-word (M-b)
       Move back to the start of the current or previous word.  Words are composed of alphanumeric characters (letters and digits).

clear-display (M-C-l)
       Clear the screen and, if possible, the terminal's scrollback buffer, then redraw the current line, leaving the current line at the top of the screen.
clear-screen (C-l)
       Clear the screen, then redraw the current line, leaving the current line at the top of the screen.  With an argument, refresh the current line without clearing the screen.
```

## Commands for Manipulating the History

```
# I use Up and Down arrow keys, but in their absence, use these:
previous-history (C-p)
       Fetch the previous command from the history list, moving back in the list.
next-history (C-n)
       Fetch the next command from the history list, moving forward in the list.

yank-nth-arg (M-C-y)
       Insert  the  first  argument to the previous command (usually the second word on the previous line) at point.  With an argument n, insert the nth word from the previous command (the words in the previous command
       begin with word 0).  A negative argument inserts the nth word from the end of the previous command.  Once the argument n is computed, the argument is extracted as if the "!n" history expansion  had  been  speci‐
       fied.
yank-last-arg (M-., M-_)
       Insert  the  last  argument to the previous command (the last word of the previous history entry).  With a numeric argument, behave exactly like yank-nth-arg.  Successive calls to yank-last-arg move back through
       the history list, inserting the last word (or the word specified by the argument to the first call) of each line in turn.  Any numeric argument supplied to these successive calls determines the direction to move
       through  the  history.  A negative argument switches the direction through the history (back or forward).  The history expansion facilities are used to extract the last word, as if the "!$" history expansion had
       been specified.
edit-and-execute-command (C-x C-e)
       Invoke an editor on the current command line, and execute the result as shell commands.  Bash attempts to invoke $VISUAL, $EDITOR, and emacs as the editor, in that order.
```

## Commands for Changing Text

```
end-of-file (usually C-d)
       The  character  indicating  end-of-file as set, for example, by ``stty''.  If this character is read when there are no characters on the line, and point is at the beginning of the line, Readline interprets it as
       the end of input and returns EOF.
quoted-insert (C-q, C-v)
       Add the next character typed to the line verbatim.  This is how to insert characters like C-q, for example.
transpose-chars (C-t)
       Drag the character before point forward over the character at point, moving point forward as well.  If point is at the end of the line, then this transposes the two characters before point.   Negative  arguments
       have no effect.
transpose-words (M-t)
       Drag the word before point past the word after point, moving point over that word as well.  If point is at the end of the line, this transposes the last two words on the line.
upcase-word (M-u)
       Uppercase the current (or following) word.  With a negative argument, uppercase the previous word, but do not move point.
downcase-word (M-l)
       Lowercase the current (or following) word.  With a negative argument, lowercase the previous word, but do not move point.
capitalize-word (M-c)
       Capitalize the current (or following) word.  With a negative argument, capitalize the previous word, but do not move point.
```

## Killing and Yanking

```
kill-line (C-k)
       Kill the text from point to the end of the line.
unix-line-discard (C-u)
       Kill backward from point to the beginning of the line.  The killed text is saved on the kill-ring.
kill-word (M-d)
       Kill from point to the end of the current word, or if between words, to the end of the next word.  Word boundaries are the same as those used by forward-word.
unix-word-rubout (C-w)
       Kill the word behind point, using white space as a word boundary.  The killed text is saved on the kill-ring.
yank (C-y)
       Yank the top of the kill ring into the buffer at point.
yank-pop (M-y)
       Rotate the kill ring, and yank the new top.  Only works following yank or yank-pop.
```

## Numeric Arguments

```
digit-argument (M-0, M-1, ..., M--)
       Add this digit to the argument already accumulating, or start a new argument.  M-- starts a negative argument.
```

## Miscellaneous

```
undo (C-_, C-x C-u)
       Incremental undo, separately remembered for each line.
revert-line (M-r)
       Undo all changes made to this line.  This is like executing the undo command enough times to return the line to its initial state.
```

## Atiun

```
pacman -S atuin bash-preexec
echo '[[ -f /usr/share/bash-preexec/bash-preexec.sh ]] && source /usr/share/bash-preexec/bash-preexec.sh' >> ~/.bashrc
echo 'eval "$(atuin init bash --disable-up-arrow)"' >> ~/.bashrc
# reboot
atuin import auto
```

# Show a date in UTC

```
date --iso-8601=minutes -u -d "2025-12-04 16:42 PST"
```
