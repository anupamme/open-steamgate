CLASS zcl_gogen_t_dynrecvalias DEFINITION PUBLIC FINAL CREATE PUBLIC.
 PUBLIC SECTION. INTERFACES zif_gogen_dynval. ALIASES val FOR zif_gogen_dynval~val.
 CLASS-METHODS run RETURNING VALUE(rv) TYPE string.
ENDCLASS.
CLASS zcl_gogen_t_dynrecvalias IMPLEMENTATION.
 METHOD zif_gogen_dynval~val. r = 42. ENDMETHOD.
 METHOD run. DATA n TYPE i. CALL METHOD ('ZCL_GOGEN_T_DYNRECVALIAS')=>('VAL') RECEIVING r = n. rv = |{ n }|. ENDMETHOD.
ENDCLASS.
