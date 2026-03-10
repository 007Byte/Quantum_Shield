package vault

import "errors"

var (
	ErrVaultNotFound = errors.New("vault not found")
	ErrUnauthorized  = errors.New("unauthorized")
)
