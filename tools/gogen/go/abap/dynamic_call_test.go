package abap

import (
	"osg/gogen/dyncall"
	"strings"
	"testing"
)

func TestDynamicCallRequiresCompiledExceptions(t *testing.T) {
	saved := dynamicRegistry
	dynamicRegistry = dyncall.New[*Session, Data]()
	KnownClasses([]string{"Z_DYN_TEST"}, nil)
	defer func() { dynamicRegistry = saved }()
	RegisterStatic("Z_DYN_TEST=>VALUE", []string{"P0"}, "RESULT", func(*Session, map[string]Data) any { return "ok" })
	cases := []struct {
		class, method, receiving, exception string
		args                                map[string]Data
		compatible                          []string
	}{
		{"Z_ABSENT", "VALUE", "", "CX_SY_DYN_CALL_ILLEGAL_CLASS", nil, nil},
		{"Z_DYN_TEST", "ABSENT", "", "CX_SY_DYN_CALL_ILLEGAL_METHOD", nil, nil},
		{"Z_DYN_TEST", "VALUE", "WRONG", "CX_SY_DYN_CALL_PARAM_NOT_FOUND", nil, nil},
		{"Z_DYN_TEST", "VALUE", "RESULT", "CX_SY_DYN_CALL_ILLEGAL_TYPE", nil, nil},
		{"Z_DYN_TEST", "VALUE", "", "CX_SY_DYN_CALL_PARAM_NOT_FOUND", map[string]Data{"WRONG": {}}, nil},
	}
	for _, c := range cases {
		t.Run(c.exception+"/"+c.receiving, func(t *testing.T) {
			defer func() {
				x := recover()
				e, ok := AsError(x)
				if !ok || e.Class != "NOT_COMPILED" || !strings.Contains(e.Error(), c.exception) || Catchable(x) {
					t.Fatalf("got %#v", x)
				}
			}()
			CallStatic(&Session{}, c.class, c.method, c.args, c.receiving, c.compatible)
			t.Fatal("expected refusal")
		})
	}
	t.Run("missing", func(t *testing.T) {
		defer func() {
			x := recover()
			e, ok := AsError(x)
			if !ok || e.Class != "NOT_COMPILED" || !strings.Contains(e.Error(), "CX_SY_DYN_CALL_PARAM_MISSING") || Catchable(x) {
				t.Fatalf("got %#v", x)
			}
		}()
		DynCallError("CX_SY_DYN_CALL_PARAM_MISSING", "Z_DYN_TEST=>VALUE P0")
	})
}
