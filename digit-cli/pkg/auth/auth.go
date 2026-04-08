package auth

import (
	"fmt"

	"digit-cli/pkg/config"
	"digit-cli/pkg/jwt"
	"github.com/digitnxt/digit3/code/libraries/digit-library/digit"
)

// GetValidJWTToken returns a valid JWT token, refreshing if necessary
func GetValidJWTToken() (string, error) {
	// Get current token
	token, err := config.GetJWTToken()
	if err != nil {
		return "", fmt.Errorf("failed to get JWT token: %w", err)
	}

	// If no token exists, return error
	if token == "" {
		return "", fmt.Errorf("no JWT token found. Please run 'digit config set' to authenticate")
	}

	// Check if token is expired
	expired, err := jwt.IsTokenExpired(token)
	if err != nil {
		return "", fmt.Errorf("failed to validate token: %w", err)
	}

	// If token is not expired, return it
	if !expired {
		return token, nil
	}

	// Token is expired, try to refresh
	fmt.Println("JWT token expired, refreshing...")
	newToken, err := RefreshToken()
	if err != nil {
		return "", fmt.Errorf("failed to refresh token: %w", err)
	}

	fmt.Println("✓ Token refreshed successfully!")
	return newToken, nil
}

// RefreshToken gets a new JWT token using stored authentication credentials
func RefreshToken() (string, error) {
	// Get stored auth config
	authConfig, err := config.GetAuthConfig()
	if err != nil {
		return "", fmt.Errorf("failed to get auth config: %w", err)
	}

	if authConfig == nil {
		return "", fmt.Errorf("no authentication configuration found. Please run 'digit config set' to authenticate")
	}

	// Get new JWT token from Keycloak
	newToken, err := digit.GetJWTToken(
		authConfig.ServerURL,
		authConfig.Realm,
		authConfig.ClientID,
		authConfig.ClientSecret,
		authConfig.Username,
		authConfig.Password,
	)
	if err != nil {
		return "", fmt.Errorf("failed to authenticate with Keycloak: %w", err)
	}

	// Store the new token
	err = config.SetJWTToken(newToken)
	if err != nil {
		return "", fmt.Errorf("failed to store new token: %w", err)
	}

	return newToken, nil
}

// GetAuthorizationHeader returns the Authorization header value with a valid JWT token
func GetAuthorizationHeader() (string, error) {
	token, err := GetValidJWTToken()
	if err != nil {
		return "", err
	}
	return "Bearer " + token, nil
}
