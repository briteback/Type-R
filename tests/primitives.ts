import { define } from '../src/class'
import { Record } from '../src/record/'
import { expect } from 'chai'

describe( 'Record', () =>{
    it( "can be instantiated", ()=>{
        new Record();
    } );

    describe( 'Subclass', ()=>{
        it( "attaches properties to prototype", ()=>{
            @define( {
                a : 'a'
            } )
            class M extends Record {}

            expect( M.prototype.a ).to.eql( 'a' );
        } );
    } );

    describe( "Attribute spec", () =>{
        describe( '...as constructors', () =>{
            @define( {
                attributes : {
                    s : String,
                    n : Number,
                    b : Boolean,
                    o : Object,
                    a : Array,
                    d : Date
                }
            } )
            class M extends Record {
            }

            it( "invokes constructor to create defaults", () =>{
                const m = new M();
                expect( m.s ).to.equal( '' );
                expect( m.n ).to.equal( 0 );
                expect( m.b ).to.equal( false );
                expect( m.o ).to.eql( {} );
                expect( m.a ).to.eql( [] );
                expect( m.d ).to.be.instanceof( Date );
            } );

            it( "convert values to defined type in 'new'", () =>{
                const m = new M( {
                    s : 55,
                    n : "1",
                    b : 'not bool',
                    o : "not an object",
                    a : "not an array",
                    d : 678678678
                } );

                expect( m.s ).to.equal( '55' );
                expect( m.n ).to.equal( 1 );
                expect( m.b ).to.equal( true );
                expect( m.o ).to.eql( {} );
                expect( m.a ).to.eql( [] );
                expect( m.d ).to.be.instanceof( Date );
            } );

            it( "convert values to defined types on assignment", () =>{
                const m = new M();

                m.s = 55;
                m.n = "1";
                m.b = 'not bool';
                m.o = "not an object";
                m.a = "not an array";
                m.d = 678678678;

                expect( m.s ).to.equal( '55' );
                expect( m.n ).to.equal( 1 );
                expect( m.b ).to.equal( true );
                expect( m.o ).to.eql( {} );
                expect( m.a ).to.eql( [] );
                expect( m.d ).to.be.instanceof( Date );
            } );

            it( "convert values to defined types on set", () =>{
                const m = new M();

                m.set({
                    s : 55,
                    n : "1",
                    b : 'not bool',
                    o : "not an object",
                    a : "not an array",
                    d : 678678678
                });

                expect( m.s ).to.equal( '55' );
                expect( m.n ).to.equal( 1 );
                expect( m.b ).to.equal( true );
                expect( m.o ).to.eql( {} );
                expect( m.a ).to.eql( [] );
                expect( m.d ).to.be.instanceof( Date );
            } );
        } );
        describe( '...as default values', () =>{
            @define( {
                attributes : {
                    s : 'b',
                    n : 1,
                    b : true,
                    o : {},
                    a : [],
                    d : new Date()
                }
            } )
            class M extends Record {
            }

            it( "accepts values as type spec", () =>{
                const m = new M();
                expect( m.s ).to.equal( 'b' );
                expect( m.n ).to.equal( 1 );
                expect( m.b ).to.equal( true );

                expect( m.o ).to.not.equal( {} );
                expect( m.o ).to.eql( {} );

                expect( m.a ).to.not.equal( [] );
                expect( m.a ).to.eql( [] );

                expect( m.d ).to.be.instanceof( Date );
            } );

            it( "infers types from values", () =>{
                const m = new M(),
                      { _attributes } = m;

                expect( _attributes.s.type ).to.equal( String );
                expect( _attributes.n.type ).to.equal( Number );
                expect( _attributes.b.type ).to.equal( Boolean );
                expect( _attributes.o.type ).to.equal( Object );
                expect( _attributes.a.type ).to.equal( Array );
                expect( _attributes.d.type ).to.equal( Date );
            } );
        } );
        describe( '...as constructors with values', () =>{
            it( "converts default values to defined types", () =>{
                @define( {
                    attributes : {
                        s : String.value( 55 ),
                        n : Number.value( "1" ),
                        b : Boolean.value( "some" ),
                        o : Object.value( "not an object" ),
                        a : Array.value( "not an array" ),
                        d : Date.value( 22222 )
                    }
                } )
                class M extends Record {}

                const m = new M();

                expect( m.s ).to.equal( '55' );
                expect( m.n ).to.equal( 1 );
                expect( m.b ).to.equal( true );
                expect( m.o ).to.eql( {} );
                expect( m.a ).to.eql( [] );
                expect( m.d ).to.be.instanceof( Date );
            } );

            it( "accepts null as default value", () =>{
                @define( {
                    attributes : {
                        s : String.value( null ),
                        n : Number.value( null ),
                        b : Boolean.value( null ),
                        o : Object.value( null ),
                        a : Array.value( null ),
                        d : Date.value( null )
                    }
                } )
                class M extends Record {}

                const m = new M();

                expect( m.s ).to.equal( null );
                expect( m.n ).to.equal( null);
                expect( m.b ).to.equal( null );
                expect( m.o ).to.eql( null );
                expect( m.a ).to.eql( null );
                expect( m.d ).to.eql( null );
            } );
        } );
    });

    describe( "Record's collection", () =>{
        it( "is defined in the base Record", ()=>{
            expect( Record.Collection ).to.be.a( 'function' );
            expect( Record.Collection.prototype.Record ).to.eql( Record );
        } );

        it( "is created on Record's extension", () =>{
            @define
            class M extends Record {
            }

            const { prototype } = M.Collection;
            expect( prototype ).to.be.instanceof( Record.Collection );
            expect( prototype.Record ).to.eql( M );
        } );

        it( "takes properties from .collection", () =>{
            @define( {
                collection : {
                    a : 'a'
                }
            } )
            class M extends Record {
            }

            expect( M.Collection.prototype.a ).to.eql( 'a' );
        } );

        it( "can be defined separately", () =>{
            @define( {
                a : 'a'
            } )
            class C extends Collection {
            }

            @define( {
                collection : C
            } )
            class M extends Record {
            }

            expect( M.Collection ).to.eql( C );
            const { prototype } = M.Collection;
            expect( prototype ).to.be.instanceof( Record.Collection );
            expect( prototype.a ).to.eql( 'a' );
            expect( prototype.Record ).to.eql( M );
        } );
    } );

    describe( 'Record pre-definition', ()=>{
        @define
        class M1 extends Record {
        }

        class M2 extends Record {}
        M2.define();

        it( 'predefine collection types', ()=>{
            expect( M1.Collection ).to.be.func;
            expect( M2.Collection ).to.be.func;
        } );

        it( "can't be instantiated", ()=>{
            new M1(); //should throw
        } );

        it( 'support forward declaration', () =>{
            @define
            class M extends Record {
            }

            expect( M.Collection ).to.be.a( 'function' );
            expect( M.Collection.prototype.Record ).to.eql( M );

            M.define( {
                a : 'a'
            } );

            expect( M.prototype.a ).to.eql( 'a' );
        } );

        it( 'can be defined', ()=>{
            M1.define( {
                a          : 'first',
                collection : {
                    b : 'second'
                }
            } );

            M2.define( {
                a : 'first'
            } );

            M2.Collection.define( {
                b : 'second'
            } );
        } );
    } );
} );