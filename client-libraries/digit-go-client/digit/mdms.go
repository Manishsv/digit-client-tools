package digit

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Stock MDMS v2 DB: VARCHAR(64) on tenantid, createdby, lastmodifiedby (audit from X-Client-Id).
const mdmsVarchar64 = 64

func clampMDMSClientID(id string) string {
	if len(id) <= mdmsVarchar64 {
		return id
	}
	return id[:mdmsVarchar64]
}

func validateMDMSTenant(tenantID string) error {
	if len(tenantID) > mdmsVarchar64 {
		return fmt.Errorf("tenant ID length %d exceeds MDMS VARCHAR(%d); use a shorter realm", len(tenantID), mdmsVarchar64)
	}
	return nil
}

func newUUIDv4() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	h := hex.EncodeToString(buf[:])
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:], nil
}

// CreateSchema creates a new MDMS schema
func CreateSchema(serverURL, jwtToken, tenantID, clientID, code, description, definition string, isActive bool) (string, error) {
	if serverURL == "" {
		return "", fmt.Errorf("server URL is required")
	}
	if tenantID == "" {
		return "", fmt.Errorf("tenant ID is required")
	}
	if err := validateMDMSTenant(tenantID); err != nil {
		return "", err
	}
	if clientID == "" {
		return "", fmt.Errorf("client ID is required")
	}
	clientID = clampMDMSClientID(clientID)
	if code == "" {
		return "", fmt.Errorf("code is required")
	}
	if len(code) > mdmsVarchar64 {
		return "", fmt.Errorf("code length %d exceeds MDMS VARCHAR(%d)", len(code), mdmsVarchar64)
	}
	if description == "" {
		return "", fmt.Errorf("description is required")
	}
	if definition == "" {
		return "", fmt.Errorf("definition is required")
	}
	if !json.Valid([]byte(definition)) {
		return "", fmt.Errorf("definition must be valid JSON")
	}

	url := strings.TrimSuffix(serverURL, "/") + "/mdms-v2/v1/schema"

	type audit struct {
		CreatedBy        string `json:"createdBy"`
		LastModifiedBy   string `json:"lastModifiedBy"`
		CreatedTime      int64  `json:"createdTime"`
		LastModifiedTime int64  `json:"lastModifiedTime"`
	}
	schemaID, err := newUUIDv4()
	if err != nil {
		return "", fmt.Errorf("generate schema id: %w", err)
	}
	now := time.Now().UnixMilli()
	payload := struct {
		SchemaDefinition struct {
			ID           string          `json:"id"`
			TenantID     string          `json:"tenantId"`
			Code         string          `json:"code"`
			Description  string          `json:"description"`
			Definition   json.RawMessage `json:"definition"`
			IsActive     bool            `json:"isActive"`
			AuditDetails audit           `json:"auditDetails"`
		} `json:"SchemaDefinition"`
	}{}
	s := &payload.SchemaDefinition
	s.ID = schemaID
	s.TenantID = tenantID
	s.Code = code
	s.Description = description
	s.Definition = json.RawMessage(definition)
	s.IsActive = isActive
	s.AuditDetails = audit{
		CreatedBy: clientID, LastModifiedBy: clientID,
		CreatedTime: now, LastModifiedTime: now,
	}

	requestBody, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	// Create request
	req, err := http.NewRequest("POST", url, bytes.NewReader(requestBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-tenant-id", tenantID)
	req.Header.Set("x-client-id", clientID)
	if jwtToken != "" {
		req.Header.Set("Authorization", "Bearer "+jwtToken)
	}

	// Send request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	return string(body), nil
}

// CreateMdmsData creates MDMS data entries
func CreateMdmsData(serverURL, jwtToken, tenantID, clientID, mdmsData string) (string, error) {
	if serverURL == "" {
		return "", fmt.Errorf("server URL is required")
	}
	if tenantID == "" {
		return "", fmt.Errorf("tenant ID is required")
	}
	if err := validateMDMSTenant(tenantID); err != nil {
		return "", err
	}
	if clientID == "" {
		return "", fmt.Errorf("client ID is required")
	}
	clientID = clampMDMSClientID(clientID)
	if mdmsData == "" {
		return "", fmt.Errorf("MDMS data is required")
	}
	if !json.Valid([]byte(mdmsData)) {
		return "", fmt.Errorf("MDMS data must be a valid JSON array")
	}

	url := strings.TrimSuffix(serverURL, "/") + "/mdms-v2/v2"

	wrap := struct {
		Mdms json.RawMessage `json:"Mdms"`
	}{Mdms: json.RawMessage(mdmsData)}
	requestBody, err := json.Marshal(wrap)
	if err != nil {
		return "", fmt.Errorf("marshal Mdms body: %w", err)
	}

	// Create request
	req, err := http.NewRequest("POST", url, bytes.NewReader(requestBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-tenant-id", tenantID)
	req.Header.Set("x-client-id", clientID)
	if jwtToken != "" {
		req.Header.Set("Authorization", "Bearer "+jwtToken)
	}

	// Send request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	return string(body), nil
}

// SearchSchema searches for an MDMS schema by code
func SearchSchema(serverURL, jwtToken, tenantID, clientID, schemaCode string) (string, error) {
	if serverURL == "" {
		return "", fmt.Errorf("server URL is required")
	}
	if tenantID == "" {
		return "", fmt.Errorf("tenant ID is required")
	}
	if err := validateMDMSTenant(tenantID); err != nil {
		return "", err
	}
	if clientID == "" {
		return "", fmt.Errorf("client ID is required")
	}
	clientID = clampMDMSClientID(clientID)
	if schemaCode == "" {
		return "", fmt.Errorf("schema code is required")
	}

	url := strings.TrimSuffix(serverURL, "/") + "/mdms-v2/v1/schema?code=" + schemaCode

	// Create request
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("X-tenant-ID", tenantID)
	req.Header.Set("X-Client-ID", clientID)
	if jwtToken != "" {
		req.Header.Set("Authorization", "Bearer "+jwtToken)
	}

	// Send request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	return string(body), nil
}

// SearchMdmsData searches for MDMS data by schema code and optional unique identifiers
func SearchMdmsData(serverURL, jwtToken, tenantID, clientID, schemaCode, uniqueIdentifiers string) (string, error) {
	if serverURL == "" {
		return "", fmt.Errorf("server URL is required")
	}
	if tenantID == "" {
		return "", fmt.Errorf("tenant ID is required")
	}
	if err := validateMDMSTenant(tenantID); err != nil {
		return "", err
	}
	if clientID == "" {
		return "", fmt.Errorf("client ID is required")
	}
	clientID = clampMDMSClientID(clientID)
	if schemaCode == "" {
		return "", fmt.Errorf("schema code is required")
	}

	url := strings.TrimSuffix(serverURL, "/") + "/mdms-v2/v2?schemaCode=" + schemaCode
	
	// Add uniqueIdentifiers parameter if provided
	if uniqueIdentifiers != "" {
		url += "&uniqueIdentifiers=" + uniqueIdentifiers
	}

	// Create request
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("X-Client-Id", clientID)
	if jwtToken != "" {
		req.Header.Set("Authorization", "Bearer "+jwtToken)
	}

	// Send request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	return string(body), nil
}
