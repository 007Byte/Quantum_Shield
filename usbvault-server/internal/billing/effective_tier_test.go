package billing

import "testing"

func TestEffectiveUserTier(t *testing.T) {
	cases := []struct{ tier, status, want string }{
		{"team", "active", "team"},
		{"enterprise", "active", "enterprise"},
		{"individual", "active", "individual"},
		{"free", "active", "free"},
		{"team", "cancelled", "free"},      // cancelled -> revert to free
		{"enterprise", "past_due", "free"}, // not active -> free
		{"team", "incomplete", "free"},
	}
	for _, c := range cases {
		if got := effectiveUserTier(c.tier, c.status); got != c.want {
			t.Errorf("effectiveUserTier(%q,%q) = %q, want %q", c.tier, c.status, got, c.want)
		}
	}
}
