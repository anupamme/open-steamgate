* Minimal public chai call shape, no upstream implementation copied.
CLASS zcl_lnt_p_base_chai DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS c_68 IMPORTING p0 TYPE string RETURNING VALUE(result) TYPE string.
ENDCLASS.
CLASS zcl_lnt_p_base_chai IMPLEMENTATION.
  METHOD c_68. result = p0. ENDMETHOD.
ENDCLASS.
