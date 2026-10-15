* Test-only closure member: open-abap-core does not supply this exception.
* Production dispatch must refuse when its closure lacks the class.
CLASS cx_sy_dyn_call_param_missing DEFINITION PUBLIC
  INHERITING FROM cx_sy_dyn_call_parameter_error CREATE PUBLIC.
ENDCLASS.
CLASS cx_sy_dyn_call_param_missing IMPLEMENTATION.
ENDCLASS.
