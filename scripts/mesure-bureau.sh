#!/usr/bin/env bash
for p in $(ps -eo pid=,args= | awk '$2 ~ /^\/opt\/google\/chrome\// {print $1}'); do awk '/^VmRSS/{r+=$2} END{printf "%d ", r}' /proc/$p/status; awk '/^Pss:/{s+=$2} END{print s+0}' /proc/$p/smaps_rollup 2>/dev/null || echo 0; done | awk '{n++; r+=$1; s+=$2} END{printf "chrome  %d processus  RSS %.0f Mo  PSS %.0f Mo\n", n, r/1024, s/1024}'
for p in $(ps -eo pid=,args= | awk '$2 == "Xvfb" {print $1}'); do awk '/^VmRSS/{printf "Xvfb  RSS %.0f Mo\n", $2/1024}' /proc/$p/status; done
