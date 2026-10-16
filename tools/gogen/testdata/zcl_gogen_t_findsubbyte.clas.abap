CLASS zcl_gogen_t_findsubbyte DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS run RETURNING VALUE(rv) TYPE string.
ENDCLASS.

CLASS zcl_gogen_t_findsubbyte IMPLEMENTATION.
  METHOD run.
    DATA s TYPE xstring VALUE 'FF3C00413C42'.
    DATA p TYPE x LENGTH 1 VALUE '3C'.
    DATA pair TYPE xstring VALUE '0041'.
    DATA missing TYPE x LENGTH 1 VALUE '99'.
    DATA o TYPE i.
    DATA rs TYPE match_result_tab.
    FIND SUBSTRING p IN s IN BYTE MODE MATCH OFFSET o.
    rv = |plain:{ sy-subrc }/{ o }|.
    FIND FIRST OCCURRENCE OF SUBSTRING pair IN s IN BYTE MODE MATCH OFFSET o.
    rv = |{ rv } first:{ sy-subrc }/{ o }|.
    FIND SUBSTRING p IN SECTION OFFSET 2 OF s IN BYTE MODE MATCH OFFSET o.
    rv = |{ rv } section:{ sy-subrc }/{ o }|.
    o = 99.
    FIND SUBSTRING missing IN s IN BYTE MODE MATCH OFFSET o.
    rv = |{ rv } miss:{ sy-subrc }/{ o }|.
    FIND ALL OCCURRENCES OF SUBSTRING p IN s IN BYTE MODE RESULTS rs.
    rv = |{ rv } results:{ sy-subrc }/{ lines( rs ) }|.
    FIND ALL OCCURRENCES OF SUBSTRING missing IN s IN BYTE MODE RESULTS rs.
    rv = |{ rv } allmiss:{ sy-subrc }/{ lines( rs ) }|.
  ENDMETHOD.
ENDCLASS.
