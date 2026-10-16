CLASS zcl_gogen_t_findsub DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS run RETURNING VALUE(rv) TYPE string.
ENDCLASS.

CLASS zcl_gogen_t_findsub IMPLEMENTATION.
  METHOD run.
    DATA s TYPE string VALUE `x.aAB.a`.
    DATA o TYPE i.
    DATA l TYPE i.
    DATA n TYPE i.
    DATA t TYPE string_table.
    DATA r TYPE match_result.
    DATA rs TYPE match_result_tab.
    FIND SUBSTRING `.a` IN s MATCH OFFSET o MATCH LENGTH l.
    rv = |plain:{ sy-subrc }/{ o }/{ l }|.
    FIND FIRST OCCURRENCE OF SUBSTRING `AB` IN s MATCH OFFSET o MATCH LENGTH l.
    rv = |{ rv } first:{ sy-subrc }/{ o }/{ l }|.
    FIND SUBSTRING `ab` IN s IGNORING CASE MATCH OFFSET o MATCH LENGTH l.
    rv = |{ rv } case:{ sy-subrc }/{ o }/{ l }|.
    o = 99. l = 98.
    FIND SUBSTRING `zz` IN s MATCH OFFSET o MATCH LENGTH l.
    rv = |{ rv } miss:{ sy-subrc }/{ o }/{ l }|.
    FIND FIRST OCCURRENCE OF SUBSTRING `.a` IN s RESULTS r.
    rv = |{ rv } result:{ sy-subrc }/{ r-line }/{ r-offset }/{ r-length }/{ lines( r-submatches ) }|.
    FIND ALL OCCURRENCES OF SUBSTRING `.a` IN s RESULTS rs.
    rv = |{ rv } results:{ sy-subrc }/{ lines( rs ) }|.
    FIND ALL OCCURRENCES OF SUBSTRING `.a` IN s MATCH COUNT n.
    rv = |{ rv } count:{ sy-subrc }/{ n }|.
    FIND ALL OCCURRENCES OF SUBSTRING `zz` IN s MATCH COUNT n.
    rv = |{ rv } countmiss:{ sy-subrc }/{ n }|.
    APPEND `none` TO t.
    APPEND s TO t.
    FIND FIRST OCCURRENCE OF SUBSTRING `.a` IN TABLE t MATCH OFFSET o MATCH LENGTH l.
    rv = |{ rv } table:{ sy-subrc }/{ o }/{ l }|.
    FIND SUBSTRING `.a` IN SECTION OFFSET 3 OF s MATCH OFFSET o MATCH LENGTH l.
    rv = |{ rv } section:{ sy-subrc }/{ o }/{ l }|.
    FIND FIRST OCCURRENCE OF SUBSTRING `.a` IN SECTION OFFSET 7 OF s MATCH OFFSET o MATCH LENGTH l.
    rv = |{ rv } sectionmiss:{ sy-subrc }/{ o }/{ l }|.
  ENDMETHOD.
ENDCLASS.
