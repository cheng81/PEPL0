# PEPL - a Process Oriented Event-Based Language

Javascript prototype, currently requires [nodejs](http://www.nodejs.org)

## Instructions

After nodejs installation,

    git clone https://github.com/cheng81/PEPL0
    cd PEPL0
    chmod +x bin/pepl.sh
    bin/pepl.sh

And you will be presented with a console. Try load some test (e.g. `:load test/treatment`)
Console commands:

  - `:load <filename>`: load `<filename>.pepl`, switch to that module
  - `:ch <namespace>`: switch to a previously loaded module
  - `:running`: list running processes
  - `:state <var/idx>`: show state of process/es
  - `:accepting <var/idx>`: show acceptance state of process/es
  - `:kill <var/idx>`: kill running processes

Other than that, you can bind variables:

  let <name> := <expression>

where `name` is an identifier and expression is:

  - a literal value (`'foo'`, `4`, `true`)
  - another variable name
  - a process path (`Main:Administer(*,*,*)`)

and you can fire a new event to a process, e.g.

    $Main.foo<1,2,3>

will send an event `foo<1,2,3>` to the (singleton) instance of the process `Main`.
Singleton processes does not have parameters, and top level ones looks really like variables, so in order to disambiguate singleton, top level, processes the `$` character is required:

    let Main := Main(1,*)
    Main.foo<5>

first matches all processes of type `Main` parametrized with the constant `1` and with any value as second parameter, then fire the event `foo<5>` to all of them, while

    $Main.foo<5>

will fire the event to the singleton top-level instance of `Main`.
Have fun!