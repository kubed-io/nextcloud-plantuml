// An excerpt of PlantUML's src/main/java/net/sourceforge/plantuml/math/ASCIIMathTeXImg.java at
// v1.2026.8, a few entries of each section of its symbol table, for the generator's tests.
package net.sourceforge.plantuml.math;

public class ASCIIMathTeXImg {

	private static final Tuple aAMsqrt  = new Tuple("sqrt"    , "msqrt", "sqrt"    , null, Ttype.UNARY );
	private static final Tuple aAMfrac  = new Tuple("frac"    , "mfrac", "/"       , null, Ttype.BINARY);
	private static final Tuple aAMdiv   = new Tuple("/"       , "mfrac", "/"       , null, Ttype.INFIX );
	private static final Tuple aAMsub   = new Tuple("_"       , "msub" , "_"       , null, Ttype.INFIX );
	private static final Tuple aAMtext  = new Tuple("text"    , "mtext", "text"    , null, Ttype.TEXT  );
	private static final Tuple aAMquote = new Tuple("\""      , "mtext", "mbox"    , null, Ttype.TEXT  );

	private static final List<Tuple> aAMsymbols = new ArrayList<>(Arrays.asList(new Tuple[] { //
			// some greek symbols
			new Tuple("alpha"     , "mi", "α", null     , Ttype.CONST     ), //
			new Tuple("epsi"      , "mi", "ε", "epsilon", Ttype.CONST     ), //

			// binary operation symbols
			new Tuple("*"       , "mo"    , "⋅"  , "cdot"     , Ttype.CONST                                ), //
			new Tuple("//"      , "mo"    , "/"       , "/"        , Ttype.CONST      , Flag.VAL, Flag.NOTEXCOPY), //
			new Tuple("\\\\"    , "mo"    , "\\"      , "backslash", Ttype.CONST                                ), //
			new Tuple("sum"     , "mo"    , "∑"  , null       , Ttype.UNDEROVER                            ), //

			// binary relation symbols
			new Tuple("!="   , "mo", "≠" , "ne"                , Ttype.CONST     ), //
			new Tuple("~="   , "mo", "≅" , "stackrel{\\sim}{=}", Ttype.CONST     , Flag.NOTEXCOPY), //

			// logical symbols
			new Tuple("and"    , "mtext", "and"   , null            , Ttype.SPACE     ), //
			new Tuple("AA"     , "mo"   , "∀", "forall"        , Ttype.CONST     ), //

			// grouping brackets
			new Tuple("("      , "mo", "("      , null    , Ttype.LEFTBRACKET  , Flag.VAL                ), //
			new Tuple(":|:"    , "mo", "|"      , "|"     , Ttype.CONST        , Flag.VAL, Flag.NOTEXCOPY), //
			new Tuple("(:"     , "mo", "〈" , "langle", Ttype.LEFTBRACKET                            ), //

			// miscellaneous symbols
			new Tuple("int"      , "mo", "∫"                   , null       , Ttype.CONST                           ), //
			new Tuple("oo"       , "mo", "∞"                   , "infty"    , Ttype.CONST                           ), //
			new Tuple("+-"       , "mo", "±"                   , "pm"       , Ttype.CONST                           ), //
			new Tuple("/_\\"     , "mo", "△"                   , "triangle" , Ttype.CONST                           ), //
			new Tuple("\\ "      , "mo", " "                   , null       , Ttype.CONST      , Flag.VAL           ), //
			new Tuple("|~"       , "mo", "⌈"                   , "lceil"    , Ttype.CONST                           ), //
			new Tuple("f"        , "mi", "f"                        , null       , Ttype.UNARY      , Flag.FUNC, Flag.VAL), //

			// standard functions
			new Tuple("lim"   , "mo", "lim"   , null, Ttype.UNDEROVER           ), //
			new Tuple("sin"   , "mo", "sin"   , null, Ttype.UNARY    , Flag.FUNC), //
			new Tuple(new String[] { "|"       , "|"        }, "abs"  , "mo", "abs"  , null, Ttype.UNARY, Flag.NOTEXCOPY), //
			new Tuple("dim", "mo", "dim", null       , Ttype.CONST                               ), //

			// arrows
			new Tuple("->"  , "mo", "→", "to"                   , Ttype.CONST), //

			// commands with argument
			aAMsqrt, aAMfrac, aAMdiv, aAMsub,
			new Tuple("bar"      , "mover"   , "¯", "overline"         , Ttype.UNARY, Flag.ACC                ), //
			aAMtext, aAMquote, //
			new Tuple("color"   , "mstyle", null      , null      , Ttype.BINARY                ), //

			// newline for formatting: in order to add a new line between multiple formulas
			new Tuple("newline", "mo", "newline", "\\\\", Ttype.CONST, Flag.VAL, Flag.NOTEXCOPY), //
	} //
	));
}
