package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"digit-cli/pkg/config"
	"digit-cli/pkg/jwt"
	"github.com/digitnxt/digit3/code/libraries/digit-library/digit"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

// defaultRegistrySchemaYAML contains the embedded default registry schema configuration
const defaultRegistrySchemaYAML = `schemaCode: "license-registry"
definition:
  $schema: "https://json-schema.org/draft/2020-12/schema"
  type: "object"
  additionalProperties: false
  properties:
    licenseNumber:
      type: "string"
    holderName:
      type: "string"
    issueDate:
      type: "string"
      format: "date"
    expiryDate:
      type: "string"
      format: "date"
    status:
      type: "string"
      enum: ["ACTIVE", "SUSPENDED", "REVOKED"]
  required: ["licenseNumber", "holderName", "issueDate", "status"]
  x-indexes:
    - name: "idx_license_status"
      fieldPath: "status"
      method: "btree"
    - fieldPath: "holderName"
      method: "gin"`

// RegistrySchemaDefinition represents the YAML structure for registry schema data
type RegistrySchemaDefinition struct {
	SchemaCode string                 `yaml:"schemaCode"`
	Definition map[string]interface{} `yaml:"definition"`
}

// RegistryDataDefinition represents the YAML structure for registry data
type RegistryDataDefinition struct {
	SchemaCode string                 `yaml:"schemaCode"`
	Data       map[string]interface{} `yaml:"data"`
}

// createRegistrySchemaCmd represents the create-registry-schema command
var createRegistrySchemaCmd = &cobra.Command{
	Use:   "create-registry-schema",
	Short: "Create registry schema from YAML file",
	Long: `Create registry schema from a YAML file definition or using default configuration.
	
Examples:
  # Create registry schema from YAML file
  digit create-registry-schema --file registry-schema.yaml
  
  # Create registry schema using default configuration with custom schema code
  digit create-registry-schema --default --schema-code "custom-license-registry"
  
  # Create registry schema using default configuration (uses license-registry)
  digit create-registry-schema --default
  
  # With server override
  digit create-registry-schema --file registry-schema.yaml --server http://localhost:8085`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Get flag values
		filePath, _ := cmd.Flags().GetString("file")
		useDefault, _ := cmd.Flags().GetBool("default")
		schemaCode, _ := cmd.Flags().GetString("schema-code")
		serverURL, _ := cmd.Flags().GetString("server")
		jwtToken, _ := cmd.Flags().GetString("jwt-token")
		
		// Validate flags - either file or default must be specified
		if !useDefault && filePath == "" {
			return fmt.Errorf("either --file or --default flag is required")
		}
		if useDefault && filePath != "" {
			return fmt.Errorf("cannot use both --file and --default flags together")
		}
		
		// Get YAML data - either from file or default configuration
		var yamlData []byte
		if useDefault {
			// Use embedded default configuration and replace the schema code if provided
			yamlContent := defaultRegistrySchemaYAML
			if schemaCode != "" {
				yamlContent = strings.ReplaceAll(yamlContent, "license-registry", schemaCode)
			}
			yamlData = []byte(yamlContent)
			fmt.Printf("Using default registry schema configuration with schema code: %s\n", 
				func() string {
					if schemaCode != "" {
						return schemaCode
					}
					return "license-registry"
				}())
		} else {
			// Read YAML file
			var err error
			yamlData, err = os.ReadFile(filePath)
			if err != nil {
				return fmt.Errorf("failed to read YAML file: %w", err)
			}
		}
		
		// Parse YAML
		var registryDef RegistrySchemaDefinition
		if err := yaml.Unmarshal(yamlData, &registryDef); err != nil {
			return fmt.Errorf("failed to parse YAML: %w", err)
		}
		
		// Validate required fields from YAML
		if registryDef.SchemaCode == "" {
			return fmt.Errorf("schemaCode is required in YAML file")
		}
		if registryDef.Definition == nil {
			return fmt.Errorf("definition is required in YAML file")
		}
		
		// Get server URL and JWT token from config if not provided
		if serverURL == "" || jwtToken == "" {
			cfg, err := config.Load()
			if err != nil {
				return fmt.Errorf("failed to load config: %w", err)
			}
			
			if serverURL == "" {
				serverURL = cfg.GetServer()
				if serverURL == "" {
					serverURL = "http://localhost:8085" // Default server URL for registry
				}
			}
			
			if jwtToken == "" {
				jwtToken = cfg.GetJWTToken()
			}
		}

		// Extract tenant ID and client ID from JWT token
		if jwtToken == "" {
			return fmt.Errorf("JWT token is required")
		}
		
		tenantID, err := jwt.ExtractTenantID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract tenant ID from JWT token: %w", err)
		}
		
		clientID, err := jwt.ExtractClientID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract client ID from JWT token: %w", err)
		}
		
		// Call the digit library to create registry schema
		responseBody, err := digit.CreateRegistrySchema(serverURL, jwtToken, tenantID, clientID, registryDef.SchemaCode, registryDef.Definition)
		if err != nil {
			return fmt.Errorf("failed to create registry schema: %w", err)
		}
		
		// Print response body
		fmt.Printf("Registry schema creation response:\n")
		
		// Try to pretty print JSON response
		var jsonResponse interface{}
		if err := json.Unmarshal([]byte(responseBody), &jsonResponse); err == nil {
			prettyJSON, err := json.MarshalIndent(jsonResponse, "", "  ")
			if err == nil {
				fmt.Println(string(prettyJSON))
			} else {
				fmt.Println(responseBody)
			}
		} else {
			fmt.Println(responseBody)
		}
		
		return nil
	},
}

// searchRegistrySchemaCmd represents the search-registry-schema command
var searchRegistrySchemaCmd = &cobra.Command{
	Use:   "search-registry-schema",
	Short: "Search for a registry schema by schema code",
	Long: `Search for a registry schema by schema code and optional version.
	
Examples:
  # Search registry schema by code
  digit search-registry-schema --schema-code "license-registry"
  
  # Search registry schema by code and version
  digit search-registry-schema --schema-code "license-registry" --version "1"
  
  # With server override
  digit search-registry-schema --schema-code "license-registry" --server http://localhost:8085`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Get flag values
		schemaCode, _ := cmd.Flags().GetString("schema-code")
		version, _ := cmd.Flags().GetString("version")
		serverURL, _ := cmd.Flags().GetString("server")
		jwtToken, _ := cmd.Flags().GetString("jwt-token")
		
		// Validate required flags
		if schemaCode == "" {
			return fmt.Errorf("--schema-code flag is required")
		}
		
		// Get server URL and JWT token from config if not provided
		if serverURL == "" || jwtToken == "" {
			cfg, err := config.Load()
			if err != nil {
				return fmt.Errorf("failed to load config: %w", err)
			}
			
			if serverURL == "" {
				serverURL = cfg.GetServer()
				if serverURL == "" {
					serverURL = "http://localhost:8085" // Default server URL for registry
				}
			}
			
			if jwtToken == "" {
				jwtToken = cfg.GetJWTToken()
			}
		}

		// Extract tenant ID and client ID from JWT token
		if jwtToken == "" {
			return fmt.Errorf("JWT token is required")
		}
		
		tenantID, err := jwt.ExtractTenantID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract tenant ID from JWT token: %w", err)
		}
		
		clientID, err := jwt.ExtractClientID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract client ID from JWT token: %w", err)
		}
		
		// Call the digit library to search registry schema
		responseBody, err := digit.SearchRegistrySchema(serverURL, jwtToken, tenantID, clientID, schemaCode, version)
		if err != nil {
			return fmt.Errorf("failed to search registry schema: %w", err)
		}
		
		// Print response body
		fmt.Printf("Registry schema search response:\n")
		
		// Try to pretty print JSON response
		var jsonResponse interface{}
		if err := json.Unmarshal([]byte(responseBody), &jsonResponse); err == nil {
			prettyJSON, err := json.MarshalIndent(jsonResponse, "", "  ")
			if err == nil {
				fmt.Println(string(prettyJSON))
			} else {
				fmt.Println(responseBody)
			}
		} else {
			fmt.Println(responseBody)
		}
		
		return nil
	},
}

// deleteRegistrySchemaCmd represents the delete-registry-schema command
var deleteRegistrySchemaCmd = &cobra.Command{
	Use:   "delete-registry-schema",
	Short: "Delete a registry schema by schema code",
	Long: `Delete a registry schema by schema code.
	
Examples:
  # Delete registry schema by code
  digit delete-registry-schema --schema-code "license-registry"
  
  # With server override
  digit delete-registry-schema --schema-code "license-registry" --server http://localhost:8085`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Get flag values
		schemaCode, _ := cmd.Flags().GetString("schema-code")
		serverURL, _ := cmd.Flags().GetString("server")
		jwtToken, _ := cmd.Flags().GetString("jwt-token")
		
		// Validate required flags
		if schemaCode == "" {
			return fmt.Errorf("--schema-code flag is required")
		}
		
		// Get server URL and JWT token from config if not provided
		if serverURL == "" || jwtToken == "" {
			cfg, err := config.Load()
			if err != nil {
				return fmt.Errorf("failed to load config: %w", err)
			}
			
			if serverURL == "" {
				serverURL = cfg.GetServer()
				if serverURL == "" {
					serverURL = "http://localhost:8085" // Default server URL for registry
				}
			}
			
			if jwtToken == "" {
				jwtToken = cfg.GetJWTToken()
			}
		}

		// Extract tenant ID and client ID from JWT token
		if jwtToken == "" {
			return fmt.Errorf("JWT token is required")
		}
		
		tenantID, err := jwt.ExtractTenantID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract tenant ID from JWT token: %w", err)
		}
		
		clientID, err := jwt.ExtractClientID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract client ID from JWT token: %w", err)
		}
		
		// Call the digit library to delete registry schema
		responseBody, err := digit.DeleteRegistrySchema(serverURL, jwtToken, tenantID, clientID, schemaCode)
		if err != nil {
			return fmt.Errorf("failed to delete registry schema: %w", err)
		}
		
		// Print response body
		fmt.Printf("Registry schema deletion response:\n")
		
		// Try to pretty print JSON response
		var jsonResponse interface{}
		if err := json.Unmarshal([]byte(responseBody), &jsonResponse); err == nil {
			prettyJSON, err := json.MarshalIndent(jsonResponse, "", "  ")
			if err == nil {
				fmt.Println(string(prettyJSON))
			} else {
				fmt.Println(responseBody)
			}
		} else {
			fmt.Println(responseBody)
		}
		
		return nil
	},
}

// createRegistryDataCmd represents the create-registry-data command
var createRegistryDataCmd = &cobra.Command{
	Use:   "create-registry-data",
	Short: "Create registry data from YAML file or JSON input",
	Long: `Create registry data from a YAML file definition or JSON input.
	
Examples:
  # Create registry data from YAML file
  digit create-registry-data --file registry-data.yaml
  
  # Create registry data with inline JSON
  digit create-registry-data --schema-code "license-registry" --data '{"licenseNumber":"DL-001","holderName":"Jane Citizen","issueDate":"2024-01-10","expiryDate":"2029-01-09","status":"ACTIVE"}'
  
  # With server override
  digit create-registry-data --file registry-data.yaml --server http://localhost:8085`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Get flag values
		filePath, _ := cmd.Flags().GetString("file")
		schemaCode, _ := cmd.Flags().GetString("schema-code")
		dataJSON, _ := cmd.Flags().GetString("data")
		serverURL, _ := cmd.Flags().GetString("server")
		jwtToken, _ := cmd.Flags().GetString("jwt-token")
		
		// Validate flags - either file or (schema-code + data) must be specified
		if filePath == "" && (schemaCode == "" || dataJSON == "") {
			return fmt.Errorf("either --file or (--schema-code and --data) flags are required")
		}
		if filePath != "" && (schemaCode != "" || dataJSON != "") {
			return fmt.Errorf("cannot use --file with --schema-code or --data flags together")
		}
		
		var registryDataDef RegistryDataDefinition
		
		if filePath != "" {
			// Read YAML file
			yamlData, err := os.ReadFile(filePath)
			if err != nil {
				return fmt.Errorf("failed to read YAML file: %w", err)
			}
			
			// Parse YAML
			if err := yaml.Unmarshal(yamlData, &registryDataDef); err != nil {
				return fmt.Errorf("failed to parse YAML: %w", err)
			}
		} else {
			// Parse JSON data from command line
			var data map[string]interface{}
			if err := json.Unmarshal([]byte(dataJSON), &data); err != nil {
				return fmt.Errorf("failed to parse JSON data: %w", err)
			}
			
			registryDataDef = RegistryDataDefinition{
				SchemaCode: schemaCode,
				Data:       data,
			}
		}
		
		// Validate required fields
		if registryDataDef.SchemaCode == "" {
			return fmt.Errorf("schemaCode is required")
		}
		if registryDataDef.Data == nil {
			return fmt.Errorf("data is required")
		}
		
		// Get server URL and JWT token from config if not provided
		if serverURL == "" || jwtToken == "" {
			cfg, err := config.Load()
			if err != nil {
				return fmt.Errorf("failed to load config: %w", err)
			}
			
			if serverURL == "" {
				serverURL = cfg.GetServer()
				if serverURL == "" {
					serverURL = "http://localhost:8085" // Default server URL for registry
				}
			}
			
			if jwtToken == "" {
				jwtToken = cfg.GetJWTToken()
			}
		}

		// Extract tenant ID and client ID from JWT token
		if jwtToken == "" {
			return fmt.Errorf("JWT token is required")
		}
		
		tenantID, err := jwt.ExtractTenantID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract tenant ID from JWT token: %w", err)
		}
		
		clientID, err := jwt.ExtractClientID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract client ID from JWT token: %w", err)
		}
		
		// Call the digit library to create registry data
		responseBody, err := digit.CreateRegistryData(serverURL, jwtToken, tenantID, clientID, registryDataDef.SchemaCode, registryDataDef.Data)
		if err != nil {
			return fmt.Errorf("failed to create registry data: %w", err)
		}
		
		// Print response body
		fmt.Printf("Registry data creation response:\n")
		
		// Try to pretty print JSON response
		var jsonResponse interface{}
		if err := json.Unmarshal([]byte(responseBody), &jsonResponse); err == nil {
			prettyJSON, err := json.MarshalIndent(jsonResponse, "", "  ")
			if err == nil {
				fmt.Println(string(prettyJSON))
			} else {
				fmt.Println(responseBody)
			}
		} else {
			fmt.Println(responseBody)
		}
		
		return nil
	},
}

// searchRegistryDataCmd represents the search-registry-data command
var searchRegistryDataCmd = &cobra.Command{
	Use:   "search-registry-data",
	Short: "Fetch registry data by schema code and registry ID",
	Long: `Fetch a registry record by schema code and registry ID (GET .../schema/{schemaCode}/data/_registry?registryId=...).

Examples:
  digit search-registry-data --schema-code "license-registry" --registry-id "REGISTRY-20251124-0006-XR"
  
  # With server override
  digit search-registry-data --schema-code "license-registry" --server http://localhost:8085`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Get flag values
		schemaCode, _ := cmd.Flags().GetString("schema-code")
		registryID, _ := cmd.Flags().GetString("registry-id")
		serverURL, _ := cmd.Flags().GetString("server")
		jwtToken, _ := cmd.Flags().GetString("jwt-token")
		
		// Validate required flags
		if schemaCode == "" {
			return fmt.Errorf("--schema-code flag is required")
		}
		
		// Get server URL and JWT token from config if not provided
		if serverURL == "" || jwtToken == "" {
			cfg, err := config.Load()
			if err != nil {
				return fmt.Errorf("failed to load config: %w", err)
			}
			
			if serverURL == "" {
				serverURL = cfg.GetServer()
				if serverURL == "" {
					serverURL = "http://localhost:8085" // Default server URL for registry
				}
			}
			
			if jwtToken == "" {
				jwtToken = cfg.GetJWTToken()
			}
		}

		// Extract tenant ID and client ID from JWT token
		if jwtToken == "" {
			return fmt.Errorf("JWT token is required")
		}
		
		tenantID, err := jwt.ExtractTenantID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract tenant ID from JWT token: %w", err)
		}
		
		clientID, err := jwt.ExtractClientID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract client ID from JWT token: %w", err)
		}
		
		// Call the digit library to search registry data
		responseBody, err := digit.SearchRegistryData(serverURL, jwtToken, tenantID, clientID, schemaCode, registryID)
		if err != nil {
			return fmt.Errorf("failed to search registry data: %w", err)
		}
		
		// Print response body
		fmt.Printf("Registry data search response:\n")
		
		// Try to pretty print JSON response
		var jsonResponse interface{}
		if err := json.Unmarshal([]byte(responseBody), &jsonResponse); err == nil {
			prettyJSON, err := json.MarshalIndent(jsonResponse, "", "  ")
			if err == nil {
				fmt.Println(string(prettyJSON))
			} else {
				fmt.Println(responseBody)
			}
		} else {
			fmt.Println(responseBody)
		}
		
		return nil
	},
}

// deleteRegistryDataCmd represents the delete-registry-data command
var deleteRegistryDataCmd = &cobra.Command{
	Use:   "delete-registry-data",
	Short: "Delete registry data by registry ID and schema code",
	Long: `Delete registry data by registry ID and schema code.
	
Examples:
  # Delete registry data by ID and schema code
  digit delete-registry-data --registry-id "ab242fea-e9c0-4d8c-9b65-655e25486c20" --schema-code "license-registry"
  
  # With server override
  digit delete-registry-data --registry-id "ab242fea-e9c0-4d8c-9b65-655e25486c20" --schema-code "license-registry" --server http://localhost:8085`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Get flag values
		registryID, _ := cmd.Flags().GetString("registry-id")
		schemaCode, _ := cmd.Flags().GetString("schema-code")
		serverURL, _ := cmd.Flags().GetString("server")
		jwtToken, _ := cmd.Flags().GetString("jwt-token")
		
		// Validate required flags
		if registryID == "" {
			return fmt.Errorf("--registry-id flag is required")
		}
		if schemaCode == "" {
			return fmt.Errorf("--schema-code flag is required")
		}
		
		// Get server URL and JWT token from config if not provided
		if serverURL == "" || jwtToken == "" {
			cfg, err := config.Load()
			if err != nil {
				return fmt.Errorf("failed to load config: %w", err)
			}
			
			if serverURL == "" {
				serverURL = cfg.GetServer()
				if serverURL == "" {
					serverURL = "http://localhost:8085" // Default server URL for registry
				}
			}
			
			if jwtToken == "" {
				jwtToken = cfg.GetJWTToken()
			}
		}

		// Extract tenant ID and client ID from JWT token
		if jwtToken == "" {
			return fmt.Errorf("JWT token is required")
		}
		
		tenantID, err := jwt.ExtractTenantID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract tenant ID from JWT token: %w", err)
		}
		
		clientID, err := jwt.ExtractClientID(jwtToken)
		if err != nil {
			return fmt.Errorf("failed to extract client ID from JWT token: %w", err)
		}
		
		// Call the digit library to delete registry data
		responseBody, err := digit.DeleteRegistryData(serverURL, jwtToken, tenantID, clientID, registryID, schemaCode)
		if err != nil {
			return fmt.Errorf("failed to delete registry data: %w", err)
		}
		
		// Print response body
		fmt.Printf("Registry data deletion response:\n")
		
		// Try to pretty print JSON response
		var jsonResponse interface{}
		if err := json.Unmarshal([]byte(responseBody), &jsonResponse); err == nil {
			prettyJSON, err := json.MarshalIndent(jsonResponse, "", "  ")
			if err == nil {
				fmt.Println(string(prettyJSON))
			} else {
				fmt.Println(responseBody)
			}
		} else {
			fmt.Println(responseBody)
		}
		
		return nil
	},
}

func init() {
	rootCmd.AddCommand(createRegistrySchemaCmd)
	rootCmd.AddCommand(searchRegistrySchemaCmd)
	rootCmd.AddCommand(deleteRegistrySchemaCmd)
	rootCmd.AddCommand(createRegistryDataCmd)
	rootCmd.AddCommand(searchRegistryDataCmd)
	rootCmd.AddCommand(deleteRegistryDataCmd)
	
	// Add flags for create-registry-schema command
	createRegistrySchemaCmd.Flags().String("file", "", "Path to YAML file containing registry schema data")
	createRegistrySchemaCmd.Flags().Bool("default", false, "Use default registry schema configuration")
	createRegistrySchemaCmd.Flags().String("schema-code", "", "Schema code for default registry schema (default: 'license-registry')")
	createRegistrySchemaCmd.Flags().String("server", "", "Server URL (overrides config, default: http://localhost:8085)")
	createRegistrySchemaCmd.Flags().String("jwt-token", "", "JWT token for authentication (overrides config)")
	
	// Add flags for search-registry-schema command
	searchRegistrySchemaCmd.Flags().String("schema-code", "", "Schema code to search for (required)")
	searchRegistrySchemaCmd.Flags().String("version", "", "Version of the schema (optional)")
	searchRegistrySchemaCmd.Flags().String("server", "", "Server URL (overrides config, default: http://localhost:8085)")
	searchRegistrySchemaCmd.Flags().String("jwt-token", "", "JWT token for authentication (overrides config)")
	
	// Add flags for delete-registry-schema command
	deleteRegistrySchemaCmd.Flags().String("schema-code", "", "Schema code to delete (required)")
	deleteRegistrySchemaCmd.Flags().String("server", "", "Server URL (overrides config, default: http://localhost:8085)")
	deleteRegistrySchemaCmd.Flags().String("jwt-token", "", "JWT token for authentication (overrides config)")
	
	// Add flags for create-registry-data command
	createRegistryDataCmd.Flags().String("file", "", "Path to YAML file containing registry data")
	createRegistryDataCmd.Flags().String("schema-code", "", "Schema code for the registry data")
	createRegistryDataCmd.Flags().String("data", "", "JSON data to create in the registry")
	createRegistryDataCmd.Flags().String("server", "", "Server URL (overrides config, default: http://localhost:8085)")
	createRegistryDataCmd.Flags().String("jwt-token", "", "JWT token for authentication (overrides config)")
	
	// Add flags for search-registry-data command
	searchRegistryDataCmd.Flags().String("schema-code", "", "Schema code to search for (required)")
	searchRegistryDataCmd.Flags().String("registry-id", "", "Registry ID to fetch (required)")
	searchRegistryDataCmd.Flags().String("server", "", "Server URL (overrides config, default: http://localhost:8085)")
	searchRegistryDataCmd.Flags().String("jwt-token", "", "JWT token for authentication (overrides config)")
	
	// Add flags for delete-registry-data command
	deleteRegistryDataCmd.Flags().String("registry-id", "", "Registry ID to delete (required)")
	deleteRegistryDataCmd.Flags().String("schema-code", "", "Schema code for the registry data (required)")
	deleteRegistryDataCmd.Flags().String("server", "", "Server URL (overrides config, default: http://localhost:8085)")
	deleteRegistryDataCmd.Flags().String("jwt-token", "", "JWT token for authentication (overrides config)")
	
	// Mark required flags
	searchRegistrySchemaCmd.MarkFlagRequired("schema-code")
	deleteRegistrySchemaCmd.MarkFlagRequired("schema-code")
	searchRegistryDataCmd.MarkFlagRequired("schema-code")
	searchRegistryDataCmd.MarkFlagRequired("registry-id")
	deleteRegistryDataCmd.MarkFlagRequired("registry-id")
	deleteRegistryDataCmd.MarkFlagRequired("schema-code")
	
	// Note: Required flags are validated conditionally in the command logic
}