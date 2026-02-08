#!/bin/bash

jq -r '.[] | select(.review == null) | select(.rating == null) | ._title' movies.json
