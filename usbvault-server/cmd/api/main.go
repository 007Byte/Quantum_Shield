package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	// Configure logging
	zerolog.SetGlobalLevel(zerolog.InfoLevel)
	if os.Getenv("LOG_LEVEL") == "debug" {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	ctx := context.Background()
	app := &App{}

	// Run the app (starts server in background)
	if err := app.Run(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to run app")
	}

	// Create a channel to listen for graceful shutdown signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Wait for signal
	<-sigChan
	log.Info().Msg("shutdown signal received")

	// Perform graceful shutdown
	if err := app.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("error during shutdown")
	}
}
