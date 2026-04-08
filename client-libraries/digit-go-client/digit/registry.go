package digit

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// RegistrySchemaRequest represents the request structure for creating a registry schema
type RegistrySchemaRequest struct {
	SchemaCode string                 `json:"schemaCode"`
	Definition map[string]interface{} `json:"definition"`
}

// RegistryDataRequest represents the request structure for creating registry data
type RegistryDataRequest struct {
	Data map[string]interface{} `json:"data"`
}

// CreateRegistrySchema creates a new registry schema in DIGIT services
// Returns the raw response body as string and any error encountered
func CreateRegistrySchema(serverURL, jwtToken, tenantID, clientID string, schemaCode string, definition map[string]interface{}) (string, error) {
	// Validate required parameters
	if serverURL == "" {
		return "", fmt.Errorf("serverURL cannot be empty")
	}
	if tenantID == "" {
		return "", fmt.Errorf("tenantID cannot be empty")
	}
	if clientID == "" {
		return "", fmt.Errorf("clientID cannot be empty")
	}
	if schemaCode == "" {
		return "", fmt.Errorf("schemaCode cannot be empty")
	}
	if definition == nil {
		return "", fmt.Errorf("definition cannot be empty")
	}

	// Create the request payload
	registryReq := RegistrySchemaRequest{
		SchemaCode: schemaCode,
		Definition: definition,
	}

	payloadBytes, err := json.Marshal(registryReq)
	if err != nil {
		return "", fmt.Errorf("failed to marshal registry schema data to JSON: %w", err)
	}

	// Make HTTP request to registry API
	url := fmt.Sprintf("%s/registry/v1/schema", serverURL)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create HTTP request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("X-Client-ID", clientID)
	if jwtToken != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", jwtToken))
	}

	// Execute request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute HTTP request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(responseBody))
	}

	return string(responseBody), nil
}

// SearchRegistrySchema searches for a registry schema by schema code and optional version
// Returns the raw response body as string and any error encountered
func SearchRegistrySchema(serverURL, jwtToken, tenantID, clientID, schemaCode, version string) (string, error) {
	// Validate required parameters
	if serverURL == "" {
		return "", fmt.Errorf("serverURL cannot be empty")
	}
	if tenantID == "" {
		return "", fmt.Errorf("tenantID cannot be empty")
	}
	if clientID == "" {
		return "", fmt.Errorf("clientID cannot be empty")
	}
	if schemaCode == "" {
		return "", fmt.Errorf("schemaCode cannot be empty")
	}

	// Build URL with query parameters
	url := fmt.Sprintf("%s/registry/v1/schema/%s", serverURL, schemaCode)
	if version != "" {
		url = fmt.Sprintf("%s?version=%s", url, version)
	}

	// Make HTTP request to registry API
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create HTTP request: %w", err)
	}

	// Set headers
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("X-Client-ID", clientID)
	if jwtToken != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", jwtToken))
	}

	// Execute request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute HTTP request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(responseBody))
	}

	return string(responseBody), nil
}

// DeleteRegistrySchema deletes a registry schema by schema code
// Returns the raw response body as string and any error encountered
func DeleteRegistrySchema(serverURL, jwtToken, tenantID, clientID, schemaCode string) (string, error) {
	// Validate required parameters
	if serverURL == "" {
		return "", fmt.Errorf("serverURL cannot be empty")
	}
	if tenantID == "" {
		return "", fmt.Errorf("tenantID cannot be empty")
	}
	if clientID == "" {
		return "", fmt.Errorf("clientID cannot be empty")
	}
	if schemaCode == "" {
		return "", fmt.Errorf("schemaCode cannot be empty")
	}

	// Build URL
	url := fmt.Sprintf("%s/registry/v1/schema/%s", serverURL, schemaCode)

	// Make HTTP request to registry API
	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create HTTP request: %w", err)
	}

	// Set headers
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("X-Client-ID", clientID)
	if jwtToken != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", jwtToken))
	}

	// Execute request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute HTTP request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(responseBody))
	}

	return string(responseBody), nil
}

// CreateRegistryData creates new registry data in DIGIT services
// Returns the raw response body as string and any error encountered
func CreateRegistryData(serverURL, jwtToken, tenantID, clientID, schemaCode string, data map[string]interface{}) (string, error) {
	// Validate required parameters
	if serverURL == "" {
		return "", fmt.Errorf("serverURL cannot be empty")
	}
	if tenantID == "" {
		return "", fmt.Errorf("tenantID cannot be empty")
	}
	if clientID == "" {
		return "", fmt.Errorf("clientID cannot be empty")
	}
	if schemaCode == "" {
		return "", fmt.Errorf("schemaCode cannot be empty")
	}
	if data == nil {
		return "", fmt.Errorf("data cannot be empty")
	}

	// Create the request payload
	registryDataReq := RegistryDataRequest{
		Data: data,
	}

	payloadBytes, err := json.Marshal(registryDataReq)
	if err != nil {
		return "", fmt.Errorf("failed to marshal registry data to JSON: %w", err)
	}

	// POST /registry/v1/schema/{schemaCode}/data (egovio/registry registry-service-2876a8b and peers)
	reqURL := fmt.Sprintf("%s/registry/v1/schema/%s/data", serverURL, url.PathEscape(schemaCode))
	req, err := http.NewRequest("POST", reqURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create HTTP request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("X-Client-ID", clientID)
	if jwtToken != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", jwtToken))
	}

	// Execute request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute HTTP request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(responseBody))
	}

	return string(responseBody), nil
}

// SearchRegistryData searches for registry data by schema code and registry ID
// Returns the raw response body as string and any error encountered
func SearchRegistryData(serverURL, jwtToken, tenantID, clientID, schemaCode, registryID string) (string, error) {
	// Validate required parameters
	if serverURL == "" {
		return "", fmt.Errorf("serverURL cannot be empty")
	}
	if tenantID == "" {
		return "", fmt.Errorf("tenantID cannot be empty")
	}
	if clientID == "" {
		return "", fmt.Errorf("clientID cannot be empty")
	}
	if schemaCode == "" {
		return "", fmt.Errorf("schemaCode cannot be empty")
	}
	if registryID == "" {
		return "", fmt.Errorf("registryID cannot be empty")
	}

	// GET /registry/v1/schema/{schemaCode}/data/_registry?registryId=...
	reqURL := fmt.Sprintf("%s/registry/v1/schema/%s/data/_registry?registryId=%s",
		serverURL, url.PathEscape(schemaCode), url.QueryEscape(registryID))

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create HTTP request: %w", err)
	}

	// Set headers
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("X-Client-ID", clientID)
	if jwtToken != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", jwtToken))
	}

	// Execute request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute HTTP request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(responseBody))
	}

	return string(responseBody), nil
}

// DeleteRegistryData deletes registry data by ID and schema code
// Returns the raw response body as string and any error encountered
func DeleteRegistryData(serverURL, jwtToken, tenantID, clientID, registryID, schemaCode string) (string, error) {
	// Validate required parameters
	if serverURL == "" {
		return "", fmt.Errorf("serverURL cannot be empty")
	}
	if tenantID == "" {
		return "", fmt.Errorf("tenantID cannot be empty")
	}
	if clientID == "" {
		return "", fmt.Errorf("clientID cannot be empty")
	}
	if registryID == "" {
		return "", fmt.Errorf("registryID cannot be empty")
	}
	if schemaCode == "" {
		return "", fmt.Errorf("schemaCode cannot be empty")
	}

	// DELETE /registry/v1/schema/{schemaCode}/data/{registryID}
	reqURL := fmt.Sprintf("%s/registry/v1/schema/%s/data/%s",
		serverURL, url.PathEscape(schemaCode), url.PathEscape(registryID))

	req, err := http.NewRequest("DELETE", reqURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create HTTP request: %w", err)
	}

	// Set headers
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("X-Client-ID", clientID)
	if jwtToken != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", jwtToken))
	}

	// Execute request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute HTTP request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(responseBody))
	}

	return string(responseBody), nil
}