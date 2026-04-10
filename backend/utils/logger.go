package utils

import (
	"log"
	"os"
)

// Info logs general informational messages to stdout.
var Info = log.New(os.Stdout, "INFO  ", log.LstdFlags)

// Error logs error-level messages to stderr.
var Error = log.New(os.Stderr, "ERROR ", log.LstdFlags)
