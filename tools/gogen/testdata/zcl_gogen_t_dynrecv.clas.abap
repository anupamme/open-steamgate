CLASS zcl_gogen_t_dynrecv DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS run RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS c_68 IMPORTING p0 TYPE string RETURNING VALUE(result) TYPE string.
    CLASS-METHODS defaults IMPORTING p0 TYPE string DEFAULT 'default' n TYPE i OPTIONAL RETURNING VALUE(result) TYPE string.
    CLASS-METHODS num RETURNING VALUE(result) TYPE i.
    CLASS-METHODS initial RETURNING VALUE(result) TYPE REF TO object.
    CLASS-METHODS obj RETURNING VALUE(result) TYPE REF TO zcl_gogen_t_dynrecv.
ENDCLASS.
CLASS zcl_gogen_t_dynrecv IMPLEMENTATION.
  METHOD c_68. result = p0. ENDMETHOD.
  METHOD defaults. result = |{ p0 }/{ n }|. ENDMETHOD.
  METHOD num. result = 42. ENDMETHOD.
  METHOD initial. ENDMETHOD.
  METHOD obj. CREATE OBJECT result. ENDMETHOD.
  METHOD run.
    DATA p0 TYPE string VALUE 'chai'.
    DATA result TYPE string.
    DATA lv_class TYPE string VALUE 'ZCL_GOGEN_T_DYNRECV'.
    DATA n TYPE i.
    DATA dyn_result TYPE i.
    DATA c TYPE c LENGTH 3.
    DATA o TYPE REF TO object.
    CALL METHOD ('ZCL_LNT_P_BASE_CHAI')=>('C_68')
      EXPORTING p0 = p0 RECEIVING result = result.
    rv = result.
    CALL METHOD (lv_class)=>('NUM') RECEIVING result = dyn_result.
    n = dyn_result.
    rv = |{ rv }/{ n }|.
    CALL METHOD (lv_class)=>('C_68') EXPORTING p0 = 'abcdef' RECEIVING result = c.
    rv = |{ rv }/{ c }|.
    CALL METHOD (lv_class)=>('OBJ') RECEIVING result = o.
    IF o IS BOUND. rv = |{ rv }/bound|. ENDIF.
    CALL METHOD (lv_class)=>('NUM').
    CALL METHOD (lv_class)=>('DEFAULTS') RECEIVING result = result.
    rv = |{ rv }/{ result }|.
    CALL METHOD (lv_class)=>('INITIAL') RECEIVING result = o.
    IF o IS NOT BOUND. rv = |{ rv }/initial|. ENDIF.
  ENDMETHOD.
ENDCLASS.
