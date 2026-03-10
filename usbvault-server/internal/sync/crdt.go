package sync

import (
	"sync"
)

// PH7-FIX: CRDT conflict resolution for multi-device sync (CWE-362)

// LWWRegister implements a Last-Writer-Wins register for conflict resolution
type LWWRegister struct {
	Value     []byte    // encrypted value (opaque to server)
	Timestamp int64     // unix nanoseconds
	NodeID    string    // device/node identifier
	Counter   uint64    // lamport clock
}

// MergeRegisters resolves conflicts between two LWW registers
// Returns the winning register (higher timestamp wins, NodeID breaks ties)
func MergeRegisters(local, remote LWWRegister) LWWRegister {
	// Higher timestamp wins
	if remote.Timestamp > local.Timestamp {
		return remote
	}
	if local.Timestamp > remote.Timestamp {
		return local
	}

	// If timestamps are equal, use NodeID lexicographic ordering (breaks ties deterministically)
	if remote.NodeID > local.NodeID {
		return remote
	}

	return local
}

// VectorClock tracks causal ordering across devices
type VectorClock map[string]uint64

// Merge combines two vector clocks (element-wise max)
func (vc VectorClock) Merge(other VectorClock) VectorClock {
	result := make(VectorClock)

	// Copy all entries from vc
	for node, counter := range vc {
		result[node] = counter
	}

	// Merge entries from other, taking maximum
	for node, counter := range other {
		if existingCounter, exists := result[node]; exists {
			if counter > existingCounter {
				result[node] = counter
			}
		} else {
			result[node] = counter
		}
	}

	return result
}

// HappensBefore returns true if vc is causally before other
// Returns true if every element in vc is <= corresponding element in other
// and at least one element is strictly less
func (vc VectorClock) HappensBefore(other VectorClock) bool {
	hasStrictlyLess := false

	// Check all nodes in vc
	for node, vc_counter := range vc {
		other_counter, exists := other[node]
		if !exists {
			// vc has a node that other doesn't have
			if vc_counter > 0 {
				return false
			}
		} else if vc_counter > other_counter {
			// vc's counter is higher than other's for this node
			return false
		} else if vc_counter < other_counter {
			hasStrictlyLess = true
		}
	}

	// Check for nodes in other that aren't in vc
	for node, other_counter := range other {
		if _, exists := vc[node]; !exists && other_counter > 0 {
			hasStrictlyLess = true
		}
	}

	return hasStrictlyLess
}

// Increment advances the clock for a given node
func (vc VectorClock) Increment(nodeID string) {
	vc[nodeID]++
}

// Concurrent returns true if neither clock is causally before the other
func (vc VectorClock) Concurrent(other VectorClock) bool {
	// Not concurrent if one happens before the other
	if vc.HappensBefore(other) || other.HappensBefore(vc) {
		return false
	}
	return true
}

// ORSet implements an Observed-Remove Set for managing file lists
type ORSet struct {
	Elements map[string]map[string]bool // element -> {unique_tag -> present}
}

// NewORSet creates a new empty OR-Set
func NewORSet() *ORSet {
	return &ORSet{
		Elements: make(map[string]map[string]bool),
	}
}

// Add adds element with a unique tag
func (s *ORSet) Add(element, tag string) {
	if _, exists := s.Elements[element]; !exists {
		s.Elements[element] = make(map[string]bool)
	}
	s.Elements[element][tag] = true
}

// Remove removes an element (all observed tags)
func (s *ORSet) Remove(element string) {
	delete(s.Elements, element)
}

// Contains checks membership
func (s *ORSet) Contains(element string) bool {
	_, exists := s.Elements[element]
	return exists && len(s.Elements[element]) > 0
}

// Merge merges two OR-Sets
// Union of all unique tags for each element
func (s *ORSet) Merge(other *ORSet) *ORSet {
	result := NewORSet()

	// Copy all elements from s
	for element, tags := range s.Elements {
		for tag := range tags {
			result.Add(element, tag)
		}
	}

	// Merge elements from other
	for element, tags := range other.Elements {
		for tag := range tags {
			result.Add(element, tag)
		}
	}

	return result
}

// List returns all present elements
func (s *ORSet) List() []string {
	var result []string
	for element, tags := range s.Elements {
		if len(tags) > 0 {
			result = append(result, element)
		}
	}
	return result
}

// ConflictResolver handles multi-device conflict resolution
type ConflictResolver struct {
	mu     sync.RWMutex
	clocks map[string]VectorClock // userID -> vector clock
}

// NewConflictResolver creates a conflict resolver
func NewConflictResolver() *ConflictResolver {
	return &ConflictResolver{
		clocks: make(map[string]VectorClock),
	}
}

// ResolveConflict resolves a conflict between local and remote states
// Returns the resolved state and whether a conflict was detected
func (cr *ConflictResolver) ResolveConflict(userID, nodeID string, local, remote LWWRegister) (LWWRegister, bool) {
	cr.mu.Lock()
	defer cr.mu.Unlock()

	// Get or create vector clock for this user
	if _, exists := cr.clocks[userID]; !exists {
		cr.clocks[userID] = make(VectorClock)
	}

	userClock := cr.clocks[userID]

	// Check if conflict (concurrent updates)
	isConflict := false

	// If both have same timestamp, we have a conflict that needs resolution
	if local.Timestamp == remote.Timestamp && local.NodeID != remote.NodeID {
		isConflict = true
	}

	// Use LWW to resolve
	resolved := MergeRegisters(local, remote)

	// Update vector clock for this node
	if remote.Counter > userClock[nodeID] {
		userClock[nodeID] = remote.Counter
	} else {
		userClock[nodeID]++
	}

	cr.clocks[userID] = userClock

	return resolved, isConflict
}
