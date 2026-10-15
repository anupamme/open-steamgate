// Package dyncall resolves dynamic static calls independently of host values.
package dyncall

import "strings"

type entry[S, D any] struct {
	params    map[string]bool
	returning string
	call      func(S, map[string]D) any
}

type Registry[S, D any] struct {
	compiled, known map[string]bool
	methods         map[string]entry[S, D]
}

func New[S, D any]() *Registry[S, D] {
	return &Registry[S, D]{map[string]bool{}, map[string]bool{}, map[string]entry[S, D]{}}
}
func (r *Registry[S, D]) Known(compiled, known []string) {
	for _, c := range compiled {
		r.compiled[c] = true
	}
	for _, c := range known {
		r.known[c] = true
	}
}
func (r *Registry[S, D]) Compiled(class string) bool { return r.compiled[class] }
func (r *Registry[S, D]) Register(name string, params []string, returning string, call func(S, map[string]D) any) {
	e := entry[S, D]{params: map[string]bool{}, returning: returning, call: call}
	for _, p := range params {
		e.params[p] = true
	}
	r.methods[name] = e
}

// Call validates the resolved signature before executing the method. fail and
// refuse are supplied by the host and must not return.
func (r *Registry[S, D]) Call(s S, class, method string, args map[string]D, receiving string, compatible []string, fail, refuse func(string, string)) (string, any) {
	c := strings.TrimRight(class, " ")
	op := "CALL METHOD (" + c + ")=>" + method
	if !r.compiled[c] {
		if r.known[c] {
			refuse(op, "the class exists but is not compiled in this program")
		}
		fail("CX_SY_DYN_CALL_ILLEGAL_CLASS", op)
	}
	key := c + "=>" + method
	e, ok := r.methods[key]
	if !ok {
		fail("CX_SY_DYN_CALL_ILLEGAL_METHOD", op)
	}
	for n := range args {
		if !e.params[n] {
			fail("CX_SY_DYN_CALL_PARAM_NOT_FOUND", key+" "+n)
		}
	}
	// Node diverges here (silent success / JS TypeError); SAP behaviour per ABAP keyword documentation, unmeasured; measure on A4H
	if receiving != "" {
		if receiving != e.returning {
			fail("CX_SY_DYN_CALL_PARAM_NOT_FOUND", key+" "+receiving)
		}
		fits := false
		for _, k := range compatible {
			if k == key {
				fits = true
			}
		}
		if !fits {
			fail("CX_SY_DYN_CALL_ILLEGAL_TYPE", key+" "+receiving)
		}
	}
	return key, e.call(s, args)
}
