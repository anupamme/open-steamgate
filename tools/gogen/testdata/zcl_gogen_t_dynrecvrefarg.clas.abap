CLASS zcl_gogen_t_dynrecvrefarg DEFINITION PUBLIC FINAL CREATE PUBLIC.
 PUBLIC SECTION.
 CLASS-METHODS run RETURNING VALUE(rv) TYPE string.
 CLASS-METHODS val IMPORTING p TYPE REF TO object RETURNING VALUE(r) TYPE string.
ENDCLASS.
CLASS zcl_gogen_t_dynrecvrefarg IMPLEMENTATION.
 METHOD val. IF p IS BOUND. r = 'bound'. ELSE. r = 'initial'. ENDIF. ENDMETHOD.
 METHOD run.
 DATA o TYPE REF TO zcl_gogen_t_dynrecvrefarg.
 DATA text TYPE string.
 CREATE OBJECT o.
 rv = val( o ).
 CALL METHOD ('ZCL_GOGEN_T_DYNRECVREFARG')=>('VAL') EXPORTING p = o RECEIVING r = text.
 rv = |{ rv }/{ text }|.
 CLEAR o.
 CALL METHOD ('ZCL_GOGEN_T_DYNRECVREFARG')=>('VAL') EXPORTING p = o RECEIVING r = text.
 rv = |{ rv }/{ text }|.
 ENDMETHOD.
ENDCLASS.
