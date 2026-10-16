CLASS zcl_gogen_t_dynrecverr DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS run RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS txt RETURNING VALUE(result) TYPE string.
    CLASS-METHODS void.
    CLASS-METHODS need IMPORTING p0 TYPE string RETURNING VALUE(result) TYPE string.
ENDCLASS.
CLASS zcl_gogen_t_dynrecverr IMPLEMENTATION.
  METHOD txt. result = 'hello'. ENDMETHOD.
  METHOD void. ENDMETHOD.
  METHOD need. result = p0. ENDMETHOD.
  METHOD run.
    DATA result TYPE string.
    DATA o TYPE REF TO object.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('TXT') RECEIVING nope = result.
        rv = |{ rv }wrong_name:silent;|.
      CATCH cx_sy_dyn_call_param_not_found.
        rv = |{ rv }CX_SY_DYN_CALL_PARAM_NOT_FOUND;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('TXT') RECEIVING nope = result.
        rv = |{ rv }root:silent;|.
      CATCH cx_root.
        rv = |{ rv }root;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('VOID') RECEIVING result = result.
        rv = |{ rv }no_return:silent;|.
      CATCH cx_sy_dyn_call_param_not_found.
        rv = |{ rv }CX_SY_DYN_CALL_PARAM_NOT_FOUND;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('VOID') RECEIVING result = result.
        rv = |{ rv }root:silent;|.
      CATCH cx_root.
        rv = |{ rv }root;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('TXT') EXPORTING nope = result RECEIVING result = result.
        rv = |{ rv }bad_export:silent;|.
      CATCH cx_sy_dyn_call_param_not_found.
        rv = |{ rv }CX_SY_DYN_CALL_PARAM_NOT_FOUND;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('TXT') EXPORTING nope = result RECEIVING result = result.
        rv = |{ rv }root:silent;|.
      CATCH cx_root.
        rv = |{ rv }root;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('NEED') RECEIVING result = result.
        rv = |{ rv }missing:silent;|.
      CATCH cx_sy_dyn_call_param_missing.
        rv = |{ rv }CX_SY_DYN_CALL_PARAM_MISSING;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('NEED') RECEIVING result = result.
        rv = |{ rv }root:silent;|.
      CATCH cx_root.
        rv = |{ rv }root;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('TXT') RECEIVING result = o.
        rv = |{ rv }bad_type:silent;|.
      CATCH cx_sy_dyn_call_illegal_type.
        rv = |{ rv }CX_SY_DYN_CALL_ILLEGAL_TYPE;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVERR')=>('TXT') RECEIVING result = o.
        rv = |{ rv }root:silent;|.
      CATCH cx_root.
        rv = |{ rv }root;|.
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
