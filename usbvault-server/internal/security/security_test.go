package security

import (
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// DASTEndpoints tests
// ---------------------------------------------------------------------------

func TestDASTEndpoints_NonEmpty(t *testing.T) {
	endpoints := DASTEndpoints()
	if len(endpoints) == 0 {
		t.Fatal("DASTEndpoints() returned empty slice")
	}
}

func TestDASTEndpoints_Count(t *testing.T) {
	endpoints := DASTEndpoints()
	// The source defines exactly 53 endpoints.
	const expected = 53
	if len(endpoints) != expected {
		t.Errorf("DASTEndpoints() returned %d endpoints, want %d", len(endpoints), expected)
	}
}

func TestDASTEndpoints_PathsStartWithSlash(t *testing.T) {
	for i, ep := range DASTEndpoints() {
		if !strings.HasPrefix(ep.Path, "/") {
			t.Errorf("endpoint[%d] path %q does not start with /", i, ep.Path)
		}
	}
}

func TestDASTEndpoints_RequiredFieldsPopulated(t *testing.T) {
	for i, ep := range DASTEndpoints() {
		if ep.Method == "" {
			t.Errorf("endpoint[%d] has empty Method", i)
		}
		if ep.Path == "" {
			t.Errorf("endpoint[%d] has empty Path", i)
		}
		if len(ep.TestCases) == 0 {
			t.Errorf("endpoint[%d] (%s %s) has no TestCases", i, ep.Method, ep.Path)
		}
	}
}

func TestDASTEndpoints_NoDuplicatePaths(t *testing.T) {
	seen := make(map[string]bool)
	for _, ep := range DASTEndpoints() {
		key := ep.Method + " " + ep.Path
		if seen[key] {
			t.Errorf("duplicate endpoint: %s", key)
		}
		seen[key] = true
	}
}

func TestDASTEndpoints_ValidMethods(t *testing.T) {
	valid := map[string]bool{
		"GET": true, "POST": true, "PUT": true, "DELETE": true, "WEBSOCKET": true,
	}
	for i, ep := range DASTEndpoints() {
		if !valid[ep.Method] {
			t.Errorf("endpoint[%d] has invalid method %q", i, ep.Method)
		}
	}
}

// ---------------------------------------------------------------------------
// DASTScanConfig tests
// ---------------------------------------------------------------------------

func TestDASTScanConfig_NonEmpty(t *testing.T) {
	cfg := DASTScanConfig()
	if len(cfg) == 0 {
		t.Fatal("DASTScanConfig() returned empty map")
	}
}

func TestDASTScanConfig_HasRequiredTopLevelKeys(t *testing.T) {
	cfg := DASTScanConfig()
	requiredKeys := []string{"name", "description", "version", "scanPolicy", "authentication", "ratelimit", "timeout", "ssl", "headers", "cors"}
	for _, k := range requiredKeys {
		if _, ok := cfg[k]; !ok {
			t.Errorf("DASTScanConfig() missing top-level key %q", k)
		}
	}
}

func TestDASTScanConfig_ScanPolicyHasPolicies(t *testing.T) {
	cfg := DASTScanConfig()
	sp, ok := cfg["scanPolicy"].(map[string]interface{})
	if !ok {
		t.Fatal("scanPolicy is not map[string]interface{}")
	}
	policies, ok := sp["policies"].([]map[string]interface{})
	if !ok {
		t.Fatal("scanPolicy.policies is not []map[string]interface{}")
	}
	if len(policies) == 0 {
		t.Error("scanPolicy.policies is empty")
	}
	// Each policy should have required fields.
	for i, p := range policies {
		for _, field := range []string{"policyid", "name", "enabled", "riskcode"} {
			if _, exists := p[field]; !exists {
				t.Errorf("policy[%d] missing field %q", i, field)
			}
		}
	}
}

// ---------------------------------------------------------------------------
// AuthBypassTests
// ---------------------------------------------------------------------------

func TestAuthBypassTests_NonEmpty(t *testing.T) {
	tests := AuthBypassTests()
	if len(tests) == 0 {
		t.Fatal("AuthBypassTests() returned empty slice")
	}
}

func TestAuthBypassTests_Count(t *testing.T) {
	if got := len(AuthBypassTests()); got != 8 {
		t.Errorf("AuthBypassTests() returned %d tests, want 8", got)
	}
}

// ---------------------------------------------------------------------------
// DataExfilTests
// ---------------------------------------------------------------------------

func TestDataExfilTests_NonEmpty(t *testing.T) {
	tests := DataExfilTests()
	if len(tests) == 0 {
		t.Fatal("DataExfilTests() returned empty slice")
	}
}

func TestDataExfilTests_Count(t *testing.T) {
	if got := len(DataExfilTests()); got != 8 {
		t.Errorf("DataExfilTests() returned %d tests, want 8", got)
	}
}

// ---------------------------------------------------------------------------
// PrivEscalationTests
// ---------------------------------------------------------------------------

func TestPrivEscalationTests_NonEmpty(t *testing.T) {
	tests := PrivEscalationTests()
	if len(tests) == 0 {
		t.Fatal("PrivEscalationTests() returned empty slice")
	}
}

func TestPrivEscalationTests_Count(t *testing.T) {
	if got := len(PrivEscalationTests()); got != 8 {
		t.Errorf("PrivEscalationTests() returned %d tests, want 8", got)
	}
}

// ---------------------------------------------------------------------------
// CryptoReviewTests
// ---------------------------------------------------------------------------

func TestCryptoReviewTests_NonEmpty(t *testing.T) {
	tests := CryptoReviewTests()
	if len(tests) == 0 {
		t.Fatal("CryptoReviewTests() returned empty slice")
	}
}

func TestCryptoReviewTests_Count(t *testing.T) {
	if got := len(CryptoReviewTests()); got != 8 {
		t.Errorf("CryptoReviewTests() returned %d tests, want 8", got)
	}
}

// ---------------------------------------------------------------------------
// CWETop25Checks
// ---------------------------------------------------------------------------

func TestCWETop25Checks_NonEmpty(t *testing.T) {
	tests := CWETop25Checks()
	if len(tests) == 0 {
		t.Fatal("CWETop25Checks() returned empty slice")
	}
}

func TestCWETop25Checks_Count(t *testing.T) {
	if got := len(CWETop25Checks()); got != 15 {
		t.Errorf("CWETop25Checks() returned %d tests, want 15", got)
	}
}

// ---------------------------------------------------------------------------
// Cross-cutting PenTestCase validations
// ---------------------------------------------------------------------------

func TestAllPenTestCases_RequiredFieldsPopulated(t *testing.T) {
	allSuites := map[string][]PenTestCase{
		"AuthBypass":     AuthBypassTests(),
		"DataExfil":      DataExfilTests(),
		"PrivEscalation": PrivEscalationTests(),
		"CryptoReview":   CryptoReviewTests(),
		"CWETop25":       CWETop25Checks(),
	}
	for suite, cases := range allSuites {
		for i, tc := range cases {
			if tc.ID == "" {
				t.Errorf("%s[%d] has empty ID", suite, i)
			}
			if tc.Category == "" {
				t.Errorf("%s[%d] (%s) has empty Category", suite, i, tc.ID)
			}
			if tc.Description == "" {
				t.Errorf("%s[%d] (%s) has empty Description", suite, i, tc.ID)
			}
			if tc.Attack == "" {
				t.Errorf("%s[%d] (%s) has empty Attack", suite, i, tc.ID)
			}
			if tc.Expected == "" {
				t.Errorf("%s[%d] (%s) has empty Expected", suite, i, tc.ID)
			}
			if len(tc.CWEs) == 0 {
				t.Errorf("%s[%d] (%s) has no CWEs", suite, i, tc.ID)
			}
		}
	}
}

func TestAllPenTestCases_NoDuplicateIDs(t *testing.T) {
	allSuites := [][]PenTestCase{
		AuthBypassTests(),
		DataExfilTests(),
		PrivEscalationTests(),
		CryptoReviewTests(),
		CWETop25Checks(),
	}
	seen := make(map[string]bool)
	for _, cases := range allSuites {
		for _, tc := range cases {
			if seen[tc.ID] {
				t.Errorf("duplicate PenTestCase ID: %s", tc.ID)
			}
			seen[tc.ID] = true
		}
	}
}

func TestAllPenTestCases_CWEsHavePrefix(t *testing.T) {
	allSuites := [][]PenTestCase{
		AuthBypassTests(),
		DataExfilTests(),
		PrivEscalationTests(),
		CryptoReviewTests(),
		CWETop25Checks(),
	}
	for _, cases := range allSuites {
		for _, tc := range cases {
			for _, cwe := range tc.CWEs {
				if !strings.HasPrefix(cwe, "CWE-") {
					t.Errorf("test %s: CWE %q does not start with 'CWE-'", tc.ID, cwe)
				}
			}
		}
	}
}

// ---------------------------------------------------------------------------
// OWASPTop10Web tests
// ---------------------------------------------------------------------------

func TestOWASPTop10Web_NonEmpty(t *testing.T) {
	controls := OWASPTop10Web()
	if len(controls) == 0 {
		t.Fatal("OWASPTop10Web() returned empty slice")
	}
}

func TestOWASPTop10Web_Count(t *testing.T) {
	if got := len(OWASPTop10Web()); got != 10 {
		t.Errorf("OWASPTop10Web() returned %d controls, want 10", got)
	}
}

func TestOWASPTop10Web_AllCompliant(t *testing.T) {
	for _, ctrl := range OWASPTop10Web() {
		if ctrl.Status != "COMPLIANT" {
			t.Errorf("OWASPTop10Web control %s (%s) status = %q, want COMPLIANT",
				ctrl.ID, ctrl.Name, ctrl.Status)
		}
	}
}

func TestOWASPTop10Web_RequiredFields(t *testing.T) {
	for i, ctrl := range OWASPTop10Web() {
		if ctrl.ID == "" {
			t.Errorf("OWASPTop10Web[%d] has empty ID", i)
		}
		if ctrl.Name == "" {
			t.Errorf("OWASPTop10Web[%d] has empty Name", i)
		}
		if ctrl.Status == "" {
			t.Errorf("OWASPTop10Web[%d] has empty Status", i)
		}
		if len(ctrl.Mitigations) == 0 {
			t.Errorf("OWASPTop10Web[%d] (%s) has no Mitigations", i, ctrl.ID)
		}
		if len(ctrl.CWEs) == 0 {
			t.Errorf("OWASPTop10Web[%d] (%s) has no CWEs", i, ctrl.ID)
		}
		if len(ctrl.Evidence) == 0 {
			t.Errorf("OWASPTop10Web[%d] (%s) has no Evidence", i, ctrl.ID)
		}
	}
}

// ---------------------------------------------------------------------------
// OWASPAPISecurityTop10 tests
// ---------------------------------------------------------------------------

func TestOWASPAPISecurityTop10_NonEmpty(t *testing.T) {
	controls := OWASPAPISecurityTop10()
	if len(controls) == 0 {
		t.Fatal("OWASPAPISecurityTop10() returned empty slice")
	}
}

func TestOWASPAPISecurityTop10_Count(t *testing.T) {
	if got := len(OWASPAPISecurityTop10()); got != 10 {
		t.Errorf("OWASPAPISecurityTop10() returned %d controls, want 10", got)
	}
}

func TestOWASPAPISecurityTop10_StatusValues(t *testing.T) {
	validStatuses := map[string]bool{
		"COMPLIANT": true, "PARTIAL": true, "NOT_APPLICABLE": true,
	}
	for _, ctrl := range OWASPAPISecurityTop10() {
		if !validStatuses[ctrl.Status] {
			t.Errorf("OWASPAPISecurityTop10 control %s has invalid status %q", ctrl.ID, ctrl.Status)
		}
	}
}

func TestOWASPAPISecurityTop10_RequiredFields(t *testing.T) {
	for i, ctrl := range OWASPAPISecurityTop10() {
		if ctrl.ID == "" {
			t.Errorf("OWASPAPISecurityTop10[%d] has empty ID", i)
		}
		if ctrl.Name == "" {
			t.Errorf("OWASPAPISecurityTop10[%d] has empty Name", i)
		}
		if len(ctrl.Mitigations) == 0 {
			t.Errorf("OWASPAPISecurityTop10[%d] (%s) has no Mitigations", i, ctrl.ID)
		}
		if len(ctrl.CWEs) == 0 {
			t.Errorf("OWASPAPISecurityTop10[%d] (%s) has no CWEs", i, ctrl.ID)
		}
		if len(ctrl.Evidence) == 0 {
			t.Errorf("OWASPAPISecurityTop10[%d] (%s) has no Evidence", i, ctrl.ID)
		}
	}
}

// ---------------------------------------------------------------------------
// OWASPMobileTop10 tests
// ---------------------------------------------------------------------------

func TestOWASPMobileTop10_NonEmpty(t *testing.T) {
	controls := OWASPMobileTop10()
	if len(controls) == 0 {
		t.Fatal("OWASPMobileTop10() returned empty slice")
	}
}

func TestOWASPMobileTop10_Count(t *testing.T) {
	if got := len(OWASPMobileTop10()); got != 10 {
		t.Errorf("OWASPMobileTop10() returned %d controls, want 10", got)
	}
}

func TestOWASPMobileTop10_StatusValues(t *testing.T) {
	validStatuses := map[string]bool{
		"COMPLIANT": true, "PARTIAL": true, "NOT_APPLICABLE": true,
	}
	for _, ctrl := range OWASPMobileTop10() {
		if !validStatuses[ctrl.Status] {
			t.Errorf("OWASPMobileTop10 control %s has invalid status %q", ctrl.ID, ctrl.Status)
		}
	}
}

func TestOWASPMobileTop10_RequiredFields(t *testing.T) {
	for i, ctrl := range OWASPMobileTop10() {
		if ctrl.ID == "" {
			t.Errorf("OWASPMobileTop10[%d] has empty ID", i)
		}
		if ctrl.Name == "" {
			t.Errorf("OWASPMobileTop10[%d] has empty Name", i)
		}
		if len(ctrl.Mitigations) == 0 {
			t.Errorf("OWASPMobileTop10[%d] (%s) has no Mitigations", i, ctrl.ID)
		}
		if len(ctrl.CWEs) == 0 {
			t.Errorf("OWASPMobileTop10[%d] (%s) has no CWEs", i, ctrl.ID)
		}
		if len(ctrl.Evidence) == 0 {
			t.Errorf("OWASPMobileTop10[%d] (%s) has no Evidence", i, ctrl.ID)
		}
	}
}

// ---------------------------------------------------------------------------
// Cross-cutting OWASP control validations
// ---------------------------------------------------------------------------

func TestAllOWASPControls_NoDuplicateIDs(t *testing.T) {
	allControls := [][]OWASPControl{
		OWASPTop10Web(),
		OWASPAPISecurityTop10(),
		OWASPMobileTop10(),
	}
	seen := make(map[string]bool)
	for _, controls := range allControls {
		for _, ctrl := range controls {
			if seen[ctrl.ID] {
				t.Errorf("duplicate OWASP control ID: %s", ctrl.ID)
			}
			seen[ctrl.ID] = true
		}
	}
}

func TestAllOWASPControls_CWEsHavePrefix(t *testing.T) {
	allControls := [][]OWASPControl{
		OWASPTop10Web(),
		OWASPAPISecurityTop10(),
		OWASPMobileTop10(),
	}
	for _, controls := range allControls {
		for _, ctrl := range controls {
			for _, cwe := range ctrl.CWEs {
				if !strings.HasPrefix(cwe, "CWE-") {
					t.Errorf("control %s: CWE %q does not start with 'CWE-'", ctrl.ID, cwe)
				}
			}
		}
	}
}
