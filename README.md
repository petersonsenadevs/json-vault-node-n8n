# n8n-nodes-json-vault

This is an n8n community node package. It provides a centralized JSON storage system (JSON Vault) for managing temporary data within n8n workflows.

JSON Vault is a system of nodes that allows you to store, update, and retrieve JSON data across your workflow without physical node connections. All data is stored in workflow static data, making it accessible from anywhere in the workflow using n8n expressions.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

Alternatively, install via npm:

```bash
npm install n8n-nodes-json-vault
```

## Operations

This package includes six nodes that work together:

### 1. JSON Vault (Central Node)

The central storage node that maintains all JSON data in workflow static data.

- **Initialize / View**: Initializes or displays the current vault contents
- **Clear All**: Clears all data from the vault

**Key Features:**
- No input/output connections required (standalone node)
- Data accessible via expressions: `{{$node["JSON Vault"].json["key"]}}`
- Persistent during workflow execution

### 2. Insert JSON

Inserts or replaces JSON data in the vault.

**Properties:**
- **Key**: The key to store the data (supports nested paths like `"users.admin"`)
- **JSON Data**: The JSON object or value to insert
- **Merge Mode**: Replace or Deep Merge
- **Data Source**: Manual entry or from previous node

**Operations:**
- Insert new key-value pairs
- Replace existing values
- Deep merge with existing objects

### 3. Update JSON

Updates existing JSON data in the vault.

**Properties:**
- **Key**: The key to update (supports nested paths)
- **JSON Data**: The new data
- **Merge Mode**: Replace or Deep Merge
- **Create if Not Exists**: Whether to create the key if it doesn't exist
- **Data Source**: Manual entry or from previous node

**Operations:**
- Update existing keys
- Deep merge with existing objects
- Conditional creation of new keys

### 4. Delete JSON

Deletes JSON data from the vault.

**Properties:**
- **Key**: The key to delete (supports nested paths)
- **Error if Not Exists**: Whether to throw an error if key doesn't exist

**Operations:**
- Delete keys and their values
- Delete nested paths (e.g., `"users.admin.settings"`)
- Returns deleted value in output

### 5. Clear JSON

Clears data from the JSON Vault.

**Properties:**
- **Clear Mode**: Clear All or Clear Specific Key
- **Key**: The key to clear (only when Clear Mode is "Clear Specific Key")

**Operations:**
- Clear all data from the vault
- Clear a specific key
- Supports nested paths

### 6. List JSON

Lists all keys and values stored in the JSON Vault.

**Properties:**
- **Output Format**: Keys Only, Keys and Values, or Full Vault
- **Include Nested Keys**: Whether to include nested keys (e.g., "users.admin.settings")

**Operations:**
- List all keys in the vault
- List keys with their values
- Return the complete vault object
- Support for nested keys listing

## Compatibility

- **Minimum n8n version**: 1.0.0
- **Tested with**: n8n 1.0.0+
- **Node.js**: v22 or higher

## Usage

### Basic Example

1. **Add JSON Vault node** to your workflow and execute it to initialize
2. **Use Insert JSON** to store data:
   ```json
   Key: "clientes"
   JSON Data: ["ALCORCON", "MADRID", "SEVILLA"]
   ```
3. **Access data from any node** using expressions:
   ```
   {{$node["JSON Vault"].json["clientes"]}}
   ```
   → Returns: `["ALCORCON", "MADRID", "SEVILLA"]`

4. **Update the data** with Update JSON:
   ```json
   Key: "clientes"
   JSON Data: ["ALCORCON", "MADRID", "SEVILLA", "VALENCIA"]
   ```

5. **Access updated data**:
   ```
   {{$node["JSON Vault"].json["clientes"]}}
   ```
   → Returns: `["ALCORCON", "MADRID", "SEVILLA", "VALENCIA"]`

### Nested Paths

You can use dot notation for nested paths:

```json
Key: "users.admin.settings"
JSON Data: {"theme": "dark", "notifications": true}
```

Access with:
```
{{$node["JSON Vault"].json["users"]["admin"]["settings"]}}
```

### Deep Merge Example

When updating objects, you can use Deep Merge to partially update:

```json
Existing: {"name": "John", "age": 30, "settings": {"theme": "light"}}
Update with: {"age": 31, "settings": {"notifications": true}}
Result: {"name": "John", "age": 31, "settings": {"theme": "light", "notifications": true}}
```

### Use Cases

- **Centralized Configuration**: Store workflow configuration in one place
- **Temporary State**: Keep state between workflow executions
- **Data Aggregation**: Collect data from multiple sources
- **Cross-Node Communication**: Share data without physical connections
- **Result Caching**: Cache intermediate results for reuse

### Important Notes

- Data is stored in workflow static data (memory)
- Data persists only during workflow execution
- Data is cleared when workflow execution completes (unless saved elsewhere)
- Maximum vault size: 10MB
- Keys must contain only letters, numbers, dots, hyphens, and underscores

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [n8n expressions documentation](https://docs.n8n.io/code-examples/expressions/)
* [n8n workflow static data](https://docs.n8n.io/code-examples/expressions/#workflow-static-data)

## Development

To develop this package locally:

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint
npm run lint:fix
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT](LICENSE.md)
