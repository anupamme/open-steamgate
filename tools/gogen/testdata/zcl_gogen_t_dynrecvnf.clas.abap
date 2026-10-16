CLASS zcl_gogen_t_dynrecvnf DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS run RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS txt RETURNING VALUE(result) TYPE string.
    CLASS-METHODS void.
    CLASS-METHODS need IMPORTING p0 TYPE string RETURNING VALUE(result) TYPE string.
ENDCLASS.
CLASS zcl_gogen_t_dynrecvnf IMPLEMENTATION.
  METHOD txt. result = 'hello'. ENDMETHOD.
  METHOD void. ENDMETHOD.
  METHOD need. result = p0. ENDMETHOD.
  METHOD run.
    DATA result TYPE string.
    DATA o TYPE REF TO object.
    TRY.
        CALL METHOD ('ZCL_GOGEN_MISSING')=>('TXT') RECEIVING result = result.
        rv = |{ rv }unknown_class:silent;|.
      CATCH cx_sy_dyn_call_illegal_class.
        rv = |{ rv }CX_SY_DYN_CALL_ILLEGAL_CLASS;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_MISSING')=>('TXT') RECEIVING result = result.
        rv = |{ rv }root:silent;|.
      CATCH cx_root.
        rv = |{ rv }root;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVNF')=>('NOPE') RECEIVING result = result.
        rv = |{ rv }unknown_method:silent;|.
      CATCH cx_sy_dyn_call_illegal_method.
        rv = |{ rv }CX_SY_DYN_CALL_ILLEGAL_METHOD;|.
    ENDTRY.
    TRY.
        CALL METHOD ('ZCL_GOGEN_T_DYNRECVNF')=>('NOPE') RECEIVING result = result.
        rv = |{ rv }root:silent;|.
      CATCH cx_root.
        rv = |{ rv }root;|.
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
